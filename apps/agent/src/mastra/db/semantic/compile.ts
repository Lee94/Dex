import type { Dialect } from '../types';
import type {
  Cube,
  Granularity,
  Measure,
  SemanticFilter,
  SemanticModel,
  SemanticQuery,
  CompileResult,
} from './types';

/**
 * The semantic query → SQL compiler.
 *
 * Given a semantic query (measures + dimensions + time grain + filters + order +
 * limit) and the active dialect, it resolves the needed joins automatically and
 * emits a single, read-only SQL statement. Member names are validated against
 * the model (so they can't inject SQL); filter *values* are escaped/validated.
 * The caller still runs the output through `assertReadOnly` before executing.
 */

// ---------------------------------------------------------------------------
// Model index (lookups + join graph)
// ---------------------------------------------------------------------------

type Edge = { to: string; onSql: string };

class ModelIndex {
  private cubes = new Map<string, Cube>();
  readonly edges = new Map<string, Edge[]>();

  constructor(readonly model: SemanticModel) {
    for (const cube of model.cubes) {
      this.cubes.set(cube.name, cube);
      this.edges.set(cube.name, this.edges.get(cube.name) ?? []);
    }
    for (const cube of model.cubes) {
      for (const join of cube.joins ?? []) {
        this.addEdge(cube.name, join.to, join.sql);
        this.addEdge(join.to, cube.name, join.sql);
      }
    }
  }

  private addEdge(from: string, to: string, onSql: string) {
    const list = this.edges.get(from) ?? [];
    list.push({ to, onSql });
    this.edges.set(from, list);
  }

  cube(name: string): Cube {
    const c = this.cubes.get(name);
    if (!c) throw new Error(`Unknown cube: "${name}".`);
    return c;
  }

  measure(cubeName: string, measureName: string): Measure {
    const m = this.cube(cubeName).measures.find((x) => x.name === measureName);
    if (!m) throw new Error(`Unknown measure: "${cubeName}.${measureName}".`);
    return m;
  }

  dimensionSql(member: string): { cube: string; sql: string; type: string; name: string } {
    const { cube, member: dimName } = splitMember(member);
    const d = this.cube(cube).dimensions.find((x) => x.name === dimName);
    if (!d) throw new Error(`Unknown dimension: "${member}".`);
    return { cube, sql: d.sql, type: d.type, name: d.name };
  }
}

function splitMember(member: string): { cube: string; member: string } {
  const dot = member.indexOf('.');
  if (dot < 0) throw new Error(`Member "${member}" must be "cube.name".`);
  return { cube: member.slice(0, dot), member: member.slice(dot + 1) };
}

// ---------------------------------------------------------------------------
// Join planning (BFS shortest paths from the base cube)
// ---------------------------------------------------------------------------

function planJoins(
  index: ModelIndex,
  base: string,
  involved: Set<string>,
): { cube: string; onSql: string }[] {
  const parent = new Map<string, { from: string; onSql: string }>();
  const order: string[] = [base];
  const visited = new Set([base]);
  const queue = [base];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const edge of index.edges.get(cur) ?? []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        parent.set(edge.to, { from: cur, onSql: edge.onSql });
        order.push(edge.to);
        queue.push(edge.to);
      }
    }
  }

  // Mark every cube on the path from each involved cube back to the base.
  const needed = new Set<string>();
  for (const cube of involved) {
    let c = cube;
    while (c !== base) {
      const pe = parent.get(c);
      if (!pe) throw new Error(`No join path from "${base}" to "${c}".`);
      needed.add(c);
      c = pe.from;
    }
  }

  // Emit joins in BFS-discovery order so each cube's parent precedes it.
  const joins: { cube: string; onSql: string }[] = [];
  for (const cube of order) {
    if (cube === base || !needed.has(cube)) continue;
    joins.push({ cube, onSql: parent.get(cube)!.onSql });
  }
  return joins;
}

// ---------------------------------------------------------------------------
// SQL fragment helpers
// ---------------------------------------------------------------------------

function quoteAlias(alias: string): string {
  return `"${alias.replace(/[^A-Za-z0-9_]/g, '_')}"`;
}

function literal(v: string | number): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Invalid numeric filter value: ${v}`);
    return String(v);
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

function measureSql(measure: Measure): string {
  const requireSql = () => {
    if (!measure.sql)
      throw new Error(`Measure "${measure.name}" (${measure.type}) needs a sql expression.`);
    return measure.sql;
  };
  switch (measure.type) {
    case 'count':
      return measure.sql ? `COUNT(${measure.sql})` : 'COUNT(*)';
    case 'count_distinct':
      return `COUNT(DISTINCT ${requireSql()})`;
    case 'sum':
      return `SUM(${requireSql()})`;
    case 'avg':
      return `AVG(${requireSql()})`;
    case 'min':
      return `MIN(${requireSql()})`;
    case 'max':
      return `MAX(${requireSql()})`;
    case 'ratio':
      return `(${requireSql()})`;
    default:
      throw new Error(`Unsupported measure type: ${String(measure.type)}`);
  }
}

function timeBucket(expr: string, grain: Granularity, dialect: Dialect): string {
  if (dialect === 'postgres') {
    const fmt: Record<Granularity, string> = {
      day: 'YYYY-MM-DD',
      week: 'IYYY-"W"IW',
      month: 'YYYY-MM',
      quarter: 'YYYY-"Q"Q',
      year: 'YYYY',
    };
    return `to_char(date_trunc('${grain}', (${expr})::timestamp), '${fmt[grain]}')`;
  }
  // SQLite
  switch (grain) {
    case 'day':
      return `strftime('%Y-%m-%d', ${expr})`;
    case 'week':
      return `strftime('%Y-W%W', ${expr})`;
    case 'month':
      return `strftime('%Y-%m', ${expr})`;
    case 'quarter':
      return `(strftime('%Y', ${expr}) || '-Q' || ((CAST(strftime('%m', ${expr}) AS INTEGER) + 2) / 3))`;
    case 'year':
      return `strftime('%Y', ${expr})`;
  }
}

function compileFilter(index: ModelIndex, filter: SemanticFilter, dialect: Dialect): string {
  const { sql: expr } = index.dimensionSql(filter.member);
  const vals = filter.values ?? [];
  if (vals.length === 0) throw new Error(`Filter on "${filter.member}" has no values.`);
  switch (filter.operator) {
    case 'equals':
      return `${expr} = ${literal(vals[0])}`;
    case 'not_equals':
      return `${expr} <> ${literal(vals[0])}`;
    case 'gt':
      return `${expr} > ${literal(vals[0])}`;
    case 'gte':
      return `${expr} >= ${literal(vals[0])}`;
    case 'lt':
      return `${expr} < ${literal(vals[0])}`;
    case 'lte':
      return `${expr} <= ${literal(vals[0])}`;
    case 'in':
      return `${expr} IN (${vals.map(literal).join(', ')})`;
    case 'contains': {
      const op = dialect === 'postgres' ? 'ILIKE' : 'LIKE';
      return `${expr} ${op} ${literal(`%${String(vals[0])}%`)}`;
    }
    default:
      throw new Error(`Unsupported filter operator: ${String(filter.operator)}`);
  }
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

type ResolvedMeasure = {
  cube: string;
  measure: Measure;
  alias: string;
  endorsed: boolean;
};

function resolveMeasure(
  index: ModelIndex,
  ref: string,
): { resolved: ResolvedMeasure; filters: SemanticFilter[] } {
  const metric = index.model.metrics.find((m) => m.name === ref);
  if (metric) {
    const { cube, member } = splitMember(metric.measure);
    const measure = index.measure(cube, member);
    return {
      resolved: {
        cube,
        measure,
        alias: metric.name,
        endorsed: !!metric.endorsed && measure.endorsed !== false,
      },
      filters: metric.filters ?? [],
    };
  }
  const { cube, member } = splitMember(ref);
  const measure = index.measure(cube, member);
  return {
    resolved: { cube, measure, alias: measure.name, endorsed: !!measure.endorsed },
    filters: [],
  };
}

/** Ensure every output column alias is unique (suffix collisions with _2, _3…). */
function dedupeAliases(items: { alias: string }[]): void {
  const seen = new Map<string, number>();
  for (const item of items) {
    const n = seen.get(item.alias) ?? 0;
    if (n > 0) item.alias = `${item.alias}_${n + 1}`;
    seen.set(item.alias, n + 1);
  }
}

export function compileSemanticQuery(
  query: SemanticQuery,
  dialect: Dialect,
  model: SemanticModel,
): CompileResult {
  const index = new ModelIndex(model);

  if (!query.measures?.length) {
    throw new Error('A semantic query needs at least one measure.');
  }

  // 1. Resolve measures (+ any metric-baked filters).
  const resolvedMeasures: ResolvedMeasure[] = [];
  const bakedFilters: SemanticFilter[] = [];
  for (const ref of query.measures) {
    const { resolved, filters } = resolveMeasure(index, ref);
    resolvedMeasures.push(resolved);
    bakedFilters.push(...filters);
  }
  const baseCube = resolvedMeasures[0].cube;

  // 2. Resolve dimensions + the optional time dimension.
  const dims: { cube: string; expr: string; alias: string }[] = [];
  for (const ref of query.dimensions ?? []) {
    const d = index.dimensionSql(ref);
    dims.push({ cube: d.cube, expr: d.sql, alias: d.name });
  }
  if (query.timeDimension) {
    const d = index.dimensionSql(query.timeDimension.dimension);
    if (d.type !== 'temporal') {
      throw new Error(`Time dimension "${query.timeDimension.dimension}" is not temporal.`);
    }
    dims.push({
      cube: d.cube,
      expr: timeBucket(d.sql, query.timeDimension.granularity, dialect),
      alias: query.timeDimension.granularity,
    });
  }

  // 3. Unique aliases across dimensions + measures.
  dedupeAliases([...dims, ...resolvedMeasures]);

  // 4. Filters (explicit + metric-baked).
  const allFilters = [...(query.filters ?? []), ...bakedFilters];
  const whereParts = allFilters.map((f) => compileFilter(index, f, dialect));

  // 5. Which cubes are involved → plan joins from the base cube.
  const involved = new Set<string>([baseCube]);
  for (const m of resolvedMeasures) {
    involved.add(m.cube);
    for (const r of m.measure.requires ?? []) involved.add(r);
  }
  for (const d of dims) involved.add(d.cube);
  for (const f of allFilters) involved.add(splitMember(f.member).cube);
  const joins = planJoins(index, baseCube, involved);

  // 6. Assemble SQL.
  const dimSelects = dims.map((d) => `${d.expr} AS ${quoteAlias(d.alias)}`);
  const measureSelects = resolvedMeasures.map(
    (m) => `${measureSql(m.measure)} AS ${quoteAlias(m.alias)}`,
  );
  const selectList = [...dimSelects, ...measureSelects].join(', ');

  let from = `${index.cube(baseCube).sql} AS ${baseCube}`;
  for (const j of joins) {
    from += `\n  LEFT JOIN ${index.cube(j.cube).sql} AS ${j.cube} ON ${j.onSql}`;
  }

  const where = whereParts.length ? `\nWHERE ${whereParts.join(' AND ')}` : '';
  const groupBy = dims.length ? `\nGROUP BY ${dims.map((d) => d.expr).join(', ')}` : '';

  let orderBy = '';
  if (query.order?.length) {
    const aliases = new Set([...dims, ...resolvedMeasures].map((x) => x.alias));
    const parts = query.order
      .filter((o) => aliases.has(o.member))
      .map((o) => `${quoteAlias(o.member)} ${o.direction === 'asc' ? 'ASC' : 'DESC'}`);
    if (parts.length) orderBy = `\nORDER BY ${parts.join(', ')}`;
  }

  let limit = '';
  if (query.limit != null) {
    const n = Math.floor(query.limit);
    if (!Number.isFinite(n) || n <= 0) throw new Error('limit must be a positive integer.');
    limit = `\nLIMIT ${n}`;
  }

  const sql = `SELECT ${selectList}\nFROM ${from}${where}${groupBy}${orderBy}${limit}`;

  return {
    sql,
    endorsed: resolvedMeasures.every((m) => m.endorsed),
    measures: resolvedMeasures.map((m) => m.alias),
    dimensions: dims.map((d) => d.alias),
    cubes: [baseCube, ...joins.map((j) => j.cube)],
  };
}
