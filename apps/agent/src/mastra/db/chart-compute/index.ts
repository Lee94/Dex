/**
 * Chart compute — **push the viewer's aggregation, sorting, filtering, time-bucketing,
 * window calcs and pagination down to SQL**.
 *
 * A chart stores only its **unaggregated base SQL**; every time the vinci viewer/designer
 * needs data it calls `apiService.compute(queries)`, the web forwards those queries here
 * (`POST /charts/:id/compute`) verbatim, and we translate each one into a layered SQL
 * query over `(base sql)`:
 *
 *   ── aggregation ──   SELECT <grain(dims)>, <AGG(measures)>
 *                       FROM (<base sql>) _dex_base
 *                       [WHERE <pre-agg filters>] GROUP BY <dims> [HAVING <post-agg filters>]
 *   ── calc (opt) ──    SELECT <dims>, <window calc(measure)>  FROM (…) _dex_calc
 *   ── top-N (opt) ──   … ORDER BY <measure> LIMIT n           (the Top-N cut)
 *   ── final ──         … ORDER BY <sort> [LIMIT <pageSize> OFFSET …]
 *
 * run read-only against the chart's data source, and shaped into vinci's columnar
 * `ChartDataResult`. Aggregation runs in the warehouse on **fresh** data, and large
 * result sets never cross the wire raw.
 *
 * The translators live in sibling modules (`fields`/`filter`/`sort`/`calc`) and each
 * emits warnings for anything it can't translate (parameters, dynamic dates, percentile
 * aggregates, exotic grains); `runCompute` returns those alongside the results. A given
 * chart only ever uses one engine — new charts = this SQL path, pre-redesign charts =
 * the in-browser JS engine (`apps/web/src/vinci/vinciCompute.ts`). `test/chart-compute.test.ts`
 * guards the translation.
 */
import { assertReadOnly } from '../guard';
import { getConnectorById } from '../connector';
import type { QueryResult } from '../types';
import { resolveFields } from './fields';
import { compileFilter } from './filter';
import { compileSort } from './sort';
import { compileCalculations } from './calc';
import type { ChartDataResult, ComputeQuery, Dialect, QueryColumn } from './types';

export type { ChartDataResult, ComputeQuery, QueryColumn } from './types';

interface BuiltSql {
  sql: string;
  dims: QueryColumn[];
  measures: QueryColumn[];
  warnings: string[];
  /** The page size, when paginating (the SQL fetches one extra to detect `hasNext`). */
  pageLimit: number | null;
}

/** A positive integer, or null (floors first, so a fractional `0.5` is rejected, not 0). */
function posInt(v: unknown): number | null {
  const n = Math.floor(typeof v === 'number' ? v : Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Translate one compute query into a (possibly layered) aggregation SQL over `(baseSql)`.
 * Pure — does no IO; `baseSql` is validated + cleaned via the read-only guard before
 * embedding. `dialect` selects dialect-aware time-bucketing (defaults to SQLite).
 */
export function buildComputeSql(
  baseSql: string,
  query: ComputeQuery,
  dialect: Dialect = 'sqlite',
): BuiltSql {
  const base = assertReadOnly(baseSql);
  const rf = resolveFields(query, dialect);
  const warnings = [...rf.warnings];
  const { dims, measures, entries, selectExprs, refs, dimAliases } = rf;
  const resolve = (k: string | null | undefined) => (k == null ? undefined : refs.get(String(k)));

  // ── aggregation layer ──
  const select = selectExprs.length > 0 ? selectExprs : ['COUNT(*) AS c0'];
  const f = compileFilter(query.filter ?? [], resolve);
  warnings.push(...f.warnings);
  const positions = dims.map((_, i) => String(i + 1));
  const where = f.where.length > 0 ? ` WHERE ${f.where.join(' AND ')}` : '';
  const groupBy = positions.length > 0 ? ` GROUP BY ${positions.join(', ')}` : '';
  const having = f.having.length > 0 ? ` HAVING ${f.having.join(' AND ')}` : '';
  let core = `SELECT ${select.join(', ')} FROM (${base}) AS _dex_base${where}${groupBy}${having}`;

  // ── calc layer (only when a measure carries a window calc) ──
  const calc = compileCalculations(
    entries.filter((e) => e.kind === 'measure'),
    dimAliases,
  );
  warnings.push(...calc.warnings);
  if (calc.exprByAlias.size > 0) {
    const outer = entries.map((e) => {
      const expr = e.kind === 'measure' ? calc.exprByAlias.get(e.alias) : undefined;
      return expr ? `${expr} AS ${e.alias}` : e.alias;
    });
    core = `SELECT ${outer.join(', ')} FROM (${core}) AS _dex_calc`;
  }

  // ── ordering, Top-N cut, pagination ──
  const sort = compileSort(query.sort ?? [], resolve);
  warnings.push(...sort.warnings);
  const sortOrder = sort.orderBy.length > 0 ? sort.orderBy : dimAliases;
  const pageSize = posInt(query.pageSize);
  const offset = pageSize != null ? (posInt(query.page) ?? 0) * pageSize : 0;

  let sql: string;
  let pageLimit: number | null = null;
  if (f.topN.length > 0) {
    if (f.topN.length > 1) warnings.push('multiple Top-N filters — only the first was applied');
    const t = f.topN[0];
    const cut = `${core} ORDER BY ${t.expr} ${t.dir} LIMIT ${t.n}`;
    // An explicit sort re-orders the kept rows after the Top-N cut (needs a wrapper).
    sql =
      sort.orderBy.length > 0
        ? `SELECT * FROM (${cut}) AS _dex_topn ORDER BY ${sort.orderBy.join(', ')}`
        : cut;
    if (pageSize != null) warnings.push('pagination was ignored alongside a Top-N filter');
  } else {
    sql = sortOrder.length > 0 ? `${core} ORDER BY ${sortOrder.join(', ')}` : core;
    if (pageSize != null) {
      // Fetch one extra row to detect `hasNext` (trimmed off in `runCompute`).
      pageLimit = pageSize;
      sql += ` LIMIT ${pageSize + 1}${offset > 0 ? ` OFFSET ${offset}` : ''}`;
    }
  }

  return { sql, dims, measures, warnings, pageLimit };
}

/** Shape a SQL aggregation result into vinci's columnar `ChartDataResult`. */
export function shapeResult(
  dims: QueryColumn[],
  measures: QueryColumn[],
  qr: QueryResult,
  hasNext = false,
): ChartDataResult {
  const defs = [...dims, ...measures];
  const cols: string[][] = defs.map((_, i) =>
    qr.rows.map((r) => {
      const v = (r as Record<string, unknown>)[`c${i}`];
      return v === null || v === undefined ? '' : String(v);
    }),
  );
  return {
    fields: defs.map((c) => ({ id: c.id, name: c.name ?? c.field ?? c.id })),
    cols,
    origins: cols.map((c) => c.slice()),
    rowSize: qr.rows.length,
    hasNext,
  };
}

/**
 * Run the viewer's compute queries against a chart's base SQL (one result each). Returns
 * the columnar results plus any translation warnings (e.g. a filter we couldn't express),
 * each prefixed with its query id.
 */
export async function runCompute(
  baseSql: string,
  datasourceId: string,
  queries: ComputeQuery[],
): Promise<{ results: ChartDataResult[]; warnings: string[] }> {
  const connector = await getConnectorById(datasourceId || 'builtin');
  const results: ChartDataResult[] = [];
  const warnings: string[] = [];
  for (const query of queries) {
    const built = buildComputeSql(baseSql, query, connector.dialect);
    for (const w of built.warnings) warnings.push(query.id ? `[${query.id}] ${w}` : w);
    const cap = built.pageLimit != null ? built.pageLimit + 1 : 10_000;
    // Guard the fully-assembled SQL, not just the base — matches the semantic compiler,
    // which runs `assertReadOnly` over its compiled output before executing.
    const qr = await connector.runReadOnlySql(assertReadOnly(built.sql), cap);
    let rows = qr.rows;
    let hasNext = false;
    if (built.pageLimit != null && rows.length > built.pageLimit) {
      hasNext = true;
      rows = rows.slice(0, built.pageLimit);
    }
    results.push(shapeResult(built.dims, built.measures, { ...qr, rows }, hasNext));
  }
  return { results, warnings };
}

/**
 * Run the base SQL with a small LIMIT to learn its columns + a few sample rows — the web
 * needs these to infer the field schema (the vinci `table` snapshot) the designer shows.
 * Not the chart data (that comes from `runCompute`); just a schema probe.
 */
export async function sampleBaseData(
  baseSql: string,
  datasourceId: string,
  limit = 50,
): Promise<{ columns: string[]; rows: QueryResult['rows'] }> {
  const base = assertReadOnly(baseSql);
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  const connector = await getConnectorById(datasourceId || 'builtin');
  const probe = assertReadOnly(`SELECT * FROM (${base}) AS _dex_base LIMIT ${n}`);
  const qr = await connector.runReadOnlySql(probe, n);
  return { columns: qr.columns, rows: qr.rows };
}

/**
 * Run the chart's base query for its raw (unaggregated) rows — what the web exports as
 * CSV. Capped by the connector's row cap (`truncated` flags it).
 */
export async function fetchBaseRows(baseSql: string, datasourceId: string): Promise<QueryResult> {
  const connector = await getConnectorById(datasourceId || 'builtin');
  return connector.runReadOnlySql(assertReadOnly(baseSql));
}
