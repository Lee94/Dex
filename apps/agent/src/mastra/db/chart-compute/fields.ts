/**
 * Resolve a compute query's shelves into dimension/measure field refs: each column's
 * output alias, its quoted raw identifier, and its `groupExpr` (a dimension's
 * dialect-aware time-bucket grain, or a measure's SQL aggregate). Also builds the
 * lookup `sort`/`filter` references resolve against (by groupId → id → field → name).
 */
import {
  GROUP,
  SUMMARY,
  SUPPORTED_SUMMARY,
  type Dialect,
  type FieldRef,
  type QueryColumn,
} from './types';
import { quoteId } from './sql';

/** The base-data column name a query column maps to (matches vinciCompute's `dataKey`). */
export const dataKey = (c: QueryColumn): string => c.field ?? c.name ?? c.id;

/** A column with no aggregation is a dimension (GROUP BY); everything else is a measure. */
export const isDimension = (c: QueryColumn): boolean =>
  (c.summary?.type ?? SUMMARY.NONE) === SUMMARY.NONE;

/**
 * Wrap a base column in the SQL aggregate matching its vinci summary type. A NULL
 * aggregate coalesces to 0 to match the legacy JS engine (`Number(x) || 0`); DISTINCT
 * and COUNT are computed correctly (the JS engine lacked a distinct case). Unsupported
 * summaries (median/stddev/variance/percentile) fall back to SUM — `resolveFields`
 * emits a warning for those so the caller can surface the approximation.
 */
export function aggExpr(col: QueryColumn): string {
  const id = quoteId(dataKey(col));
  switch (col.summary?.type) {
    case SUMMARY.AVERAGE:
      return `COALESCE(AVG(${id}), 0)`;
    case SUMMARY.MAX:
      return `COALESCE(MAX(${id}), 0)`;
    case SUMMARY.MIN:
      return `COALESCE(MIN(${id}), 0)`;
    case SUMMARY.DISTINCT:
      return `COUNT(DISTINCT ${id})`;
    case SUMMARY.COUNT:
      return `COUNT(*)`;
    default:
      return `COALESCE(SUM(${id}), 0)`;
  }
}

/**
 * A dimension's grouping expression for its `group.type` time grain. NONE/SAME (and an
 * absent group) group by the raw value. Date grains truncate dialect-aware — SQLite
 * `strftime`, Postgres `date_trunc`/`extract` — producing chronologically-sortable keys
 * for the year/month/day/hour family and the numeric bucket (1–12, 1–53, …) for the
 * cyclical grains (quarter/month-of-year/weekday/…). An unsupported grain warns and
 * falls back to the raw value.
 */
export function grainExpr(
  quoted: string,
  groupType: number | undefined,
  dialect: Dialect,
  warn: (msg: string) => void,
): string {
  const t = groupType ?? GROUP.NONE;
  if (t === GROUP.NONE || t === GROUP.SAME) return quoted;
  const pg = dialect === 'postgres';
  // Postgres needs an explicit timestamp cast (the column may be text); cast once.
  const ts = pg ? `(${quoted})::timestamp` : quoted;
  const trunc = (fmt: string, unit: string) =>
    pg
      ? `to_char(date_trunc('${unit}', ${ts}), '${fmt}')`
      : `strftime('${sqliteFmt(fmt)}', ${quoted})`;
  const part = (sqliteSpec: string, pgUnit: string) =>
    pg ? `extract(${pgUnit} from ${ts})` : `CAST(strftime('${sqliteSpec}', ${quoted}) AS INTEGER)`;

  switch (t) {
    case GROUP.Y:
      return trunc('YYYY', 'year');
    case GROUP.Y_M:
      return trunc('YYYY-MM', 'month');
    case GROUP.Y_M_D:
      return trunc('YYYY-MM-DD', 'day');
    case GROUP.Y_M_D_H_MIN_S:
      return pg
        ? `to_char(date_trunc('second', ${ts}), 'YYYY-MM-DD HH24:MI:SS')`
        : `strftime('%Y-%m-%d %H:%M:%S', ${quoted})`;
    case GROUP.Y_Q:
      return pg
        ? `(to_char(${ts}, 'YYYY') || '-Q' || extract(quarter from ${ts}))`
        : `(strftime('%Y', ${quoted}) || '-Q' || ((CAST(strftime('%m', ${quoted}) AS INTEGER) + 2) / 3))`;
    case GROUP.Y_W:
      return pg
        ? `to_char(${ts}, 'IYYY-"W"IW')`
        : `(strftime('%Y', ${quoted}) || '-W' || strftime('%W', ${quoted}))`;
    case GROUP.M_D:
      return pg ? `to_char(${ts}, 'MM-DD')` : `strftime('%m-%d', ${quoted})`;
    case GROUP.Q:
      return pg
        ? `extract(quarter from ${ts})`
        : `((CAST(strftime('%m', ${quoted}) AS INTEGER) + 2) / 3)`;
    case GROUP.M:
      return part('%m', 'month');
    case GROUP.W:
      return part('%W', 'week');
    case GROUP.WD:
      return pg ? `extract(dow from ${ts})` : `CAST(strftime('%w', ${quoted}) AS INTEGER)`;
    case GROUP.D:
      return part('%d', 'day');
    case GROUP.H:
      return part('%H', 'hour');
    case GROUP.MIN:
      return part('%M', 'minute');
    case GROUP.S:
      return part('%S', 'second');
    // GROUP.Y_CYCLE (23) and other exotic grains have no portable SQL analog — fall through.
    default:
      warn(`unsupported time grain (group.type ${t}) — grouped by raw value`);
      return quoted;
  }
}

/** Map a Postgres `to_char` format to the SQLite `strftime` equivalent for trunc grains. */
function sqliteFmt(fmt: string): string {
  return fmt.replace('YYYY', '%Y').replace('MM', '%m').replace('DD', '%d');
}

export interface ResolvedFields {
  dims: QueryColumn[];
  measures: QueryColumn[];
  /** Field refs in output order (dims then measures), aligned to aliases c0…cN. */
  entries: FieldRef[];
  /** `<groupExpr> AS cN` for each entry — the inner aggregation's SELECT list. */
  selectExprs: string[];
  /** Lookup for sort/filter references: groupId → id → field → name → ref. */
  refs: Map<string, FieldRef>;
  /** Dimension aliases (c0…) — the default ORDER BY and the accumulate window order. */
  dimAliases: string[];
  warnings: string[];
}

/**
 * Split a query's shelves into dims/measures, assign output aliases (dims first, then
 * measures — matching the legacy engine), and build the SELECT exprs + the reference
 * lookup. The merge order is rows → columns → values, mirroring `fieldDefsOf`.
 */
export function resolveFields(
  query: { rows?: QueryColumn[]; columns?: QueryColumn[]; values?: QueryColumn[] },
  dialect: Dialect,
): ResolvedFields {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);

  const all = [...(query.rows ?? []), ...(query.columns ?? []), ...(query.values ?? [])].filter(
    (c) => (c.columnType ?? 0) === 0 && dataKey(c),
  );
  const dims = all.filter(isDimension);
  const measures = all.filter((c) => !isDimension(c));

  const entries: FieldRef[] = [];
  const selectExprs: string[] = [];
  const ordered = [...dims, ...measures];
  ordered.forEach((col, i) => {
    const alias = `c${i}`;
    const quotedRaw = quoteId(dataKey(col));
    const dim = isDimension(col);
    if (!dim && col.summary != null && !SUPPORTED_SUMMARY.has(col.summary.type)) {
      warn(
        `unsupported aggregation (summary.type ${col.summary.type}) on "${dataKey(col)}" — used SUM`,
      );
    }
    const groupExpr = dim ? grainExpr(quotedRaw, col.group?.type, dialect, warn) : aggExpr(col);
    const ref: FieldRef = { col, kind: dim ? 'dim' : 'measure', alias, quotedRaw, groupExpr };
    entries.push(ref);
    selectExprs.push(`${groupExpr} AS ${alias}`);
  });

  // Reference lookup. groupId + id are unique per column (register always); field + name
  // are last-resort fallbacks (register only if free, so a specific key always wins).
  const refs = new Map<string, FieldRef>();
  for (const ref of entries) {
    const { col } = ref;
    if (col.groupId) refs.set(col.groupId, ref);
    if (col.id) refs.set(col.id, ref);
    if (col.field && !refs.has(col.field)) refs.set(col.field, ref);
    if (col.name && !refs.has(col.name)) refs.set(col.name, ref);
  }

  const dimAliases = entries.filter((e) => e.kind === 'dim').map((e) => e.alias);
  return { dims, measures, entries, selectExprs, refs, dimAliases, warnings };
}
