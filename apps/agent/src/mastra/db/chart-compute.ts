/**
 * Chart compute — **push the viewer's aggregation down to SQL**.
 *
 * In the old model the web shipped an upstream result's raw rows to the browser and
 * `apps/web/src/vinci/vinciCompute.ts` grouped/aggregated them in JS. In the live-data
 * redesign a chart stores only its **unaggregated base SQL**; every time the vinci
 * viewer/designer needs data it calls `apiService.compute(queries)`, the web forwards
 * those queries here (`POST /charts/:id/compute`), and we translate each one into
 *
 *   SELECT <dim cols>, <AGG(measure cols)> FROM (<base sql>) _dex_base GROUP BY <dims>
 *
 * run it read-only against the chart's data source, and shape the result into vinci's
 * columnar `ChartDataResult`. So the aggregation runs in the warehouse on **fresh**
 * data, and large result sets never cross the wire raw.
 *
 * The query shape + result shape mirror `vinciCompute.ts` so a chart computes the same
 * way whether it runs through the (legacy) in-browser engine or this SQL path — with
 * two deliberate corrections: a NULL aggregate coalesces to 0 (the JS engine coerced
 * via `Number(x) || 0`), and DISTINCT is a real `COUNT(DISTINCT)` (the JS engine had no
 * distinct case and fell back to SUM). A given chart only ever uses one engine (new
 * charts = SQL, pre-redesign charts = JS), so these never disagree within one chart.
 * The summary-type → aggregate mapping is copied from `@vinci/core` SUMMARY_TYPES (that
 * package lives only in apps/web; this mirrors how `agents/viz-dsl-validate.ts` copies
 * vinci enum tables). Keep in sync if the vendored vinci is upgraded —
 * `test/chart-compute.test.ts` guards the translation.
 */
import { assertReadOnly } from './guard';
import { getConnectorById } from './connector';
import type { QueryResult } from './types';

// @vinci/core SUMMARY_TYPES (subset we map). NONE = a dimension to GROUP BY; the rest
// are aggregations. Values beyond these fall back to SUM, matching vinciCompute.ts.
const SUMMARY = {
  NONE: 0,
  SUM: 1,
  AVERAGE: 2,
  MAX: 3,
  MIN: 4,
  DISTINCT: 6,
  COUNT: 7,
} as const;

export interface QueryColumn {
  columnType?: number;
  id: string;
  field?: string;
  name?: string;
  summary?: { type: number };
}

export interface ComputeQuery {
  id: string;
  rows?: QueryColumn[];
  columns?: QueryColumn[];
  values?: QueryColumn[];
  layerType?: 'agg' | 'afterAgg' | 'filter';
}

/** vinci's columnar chart-data result (one per query). */
export interface ChartDataResult {
  fields: Array<{ id: string; name: string }>;
  cols: string[][];
  origins: string[][];
  rowSize: number;
  hasNext: boolean;
}

/** The ORIGIN column name in the base data (matches vinciCompute's `dataKey`). */
const dataKey = (c: QueryColumn): string => c.field ?? c.name ?? c.id;
const isDimension = (c: QueryColumn): boolean => (c.summary?.type ?? SUMMARY.NONE) === SUMMARY.NONE;

/** Quote a SQL identifier for SQLite/Postgres (double-quote, escape embedded quotes). */
const quoteId = (name: string): string => `"${String(name).replace(/"/g, '""')}"`;

/** Wrap a base column in the SQL aggregate matching a vinci summary type. */
function aggExpr(col: QueryColumn): string {
  const id = quoteId(dataKey(col));
  // Coalesce NULL aggregates to 0 to match the JS engine (`Number(x) || 0`), so an
  // all-NULL group (e.g. a LEFT JOIN miss) renders 0 rather than a blank.
  switch (col.summary?.type) {
    case SUMMARY.AVERAGE:
      return `COALESCE(AVG(${id}), 0)`;
    case SUMMARY.MAX:
      return `COALESCE(MAX(${id}), 0)`;
    case SUMMARY.MIN:
      return `COALESCE(MIN(${id}), 0)`;
    case SUMMARY.DISTINCT:
      // vinci's "distinct count"; the JS engine lacked a distinct case and fell back to
      // SUM — the SQL path computes it correctly. (Never NULL, so no COALESCE.)
      return `COUNT(DISTINCT ${id})`;
    case SUMMARY.COUNT:
      // vinciCompute COUNT = rows-in-group, regardless of the column. (Never NULL.)
      return `COUNT(*)`;
    default:
      // SUM and the long tail (median/percentile/etc.).
      return `COALESCE(SUM(${id}), 0)`;
  }
}

/** A query's dimension + measure columns, in the order vinci expects them back. */
function fieldDefsOf(query: ComputeQuery): { dims: QueryColumn[]; measures: QueryColumn[] } {
  const all = [...(query.rows ?? []), ...(query.columns ?? []), ...(query.values ?? [])].filter(
    (c) => (c.columnType ?? 0) === 0 && dataKey(c),
  );
  return { dims: all.filter(isDimension), measures: all.filter((c) => !isDimension(c)) };
}

/**
 * Translate one compute query into an aggregation SQL over `(baseSql)`. Pure — does
 * no IO; `baseSql` is validated + cleaned via the read-only guard before embedding.
 * Returns the SQL plus the field defs (so the caller can shape the result columns).
 */
export function buildComputeSql(
  baseSql: string,
  query: ComputeQuery,
): { sql: string; dims: QueryColumn[]; measures: QueryColumn[] } {
  const base = assertReadOnly(baseSql); // single read-only statement, trailing ; stripped
  const { dims, measures } = fieldDefsOf(query);

  const select: string[] = [];
  dims.forEach((d, i) => select.push(`${quoteId(dataKey(d))} AS c${i}`));
  measures.forEach((m, j) => select.push(`${aggExpr(m)} AS c${dims.length + j}`));
  // No columns at all (shouldn't happen) → COUNT(*) so the query is valid.
  if (select.length === 0) select.push('COUNT(*) AS c0');

  const positions = dims.map((_, i) => String(i + 1));
  const groupBy = positions.length > 0 ? ` GROUP BY ${positions.join(', ')}` : '';
  // Deterministic order by the dimensions (vinci re-sorts per the DSL's own sort on top).
  const orderBy = positions.length > 0 ? ` ORDER BY ${positions.join(', ')}` : '';

  const sql = `SELECT ${select.join(', ')} FROM (${base}) AS _dex_base${groupBy}${orderBy}`;
  return { sql, dims, measures };
}

/** Shape a SQL aggregation result into vinci's columnar `ChartDataResult`. */
export function shapeResult(
  dims: QueryColumn[],
  measures: QueryColumn[],
  qr: QueryResult,
): ChartDataResult {
  const defs = [...dims, ...measures];
  const cols: string[][] = defs.map((_, i) =>
    qr.rows.map((r) => {
      const v = (r as Record<string, unknown>)[`c${i}`];
      return v === null || v === undefined ? '' : String(v);
    }),
  );
  return {
    fields: defs.map((c) => ({ id: c.id, name: c.name ?? dataKey(c) })),
    cols,
    origins: cols.map((c) => c.slice()),
    rowSize: qr.rows.length,
    hasNext: false,
  };
}

/** Run the viewer's compute queries against a chart's base SQL (one result each). */
export async function runCompute(
  baseSql: string,
  datasourceId: string,
  queries: ComputeQuery[],
): Promise<ChartDataResult[]> {
  const connector = await getConnectorById(datasourceId || 'builtin');
  const out: ChartDataResult[] = [];
  for (const query of queries) {
    const { sql, dims, measures } = buildComputeSql(baseSql, query);
    const qr = await connector.runReadOnlySql(sql, 10_000);
    out.push(shapeResult(dims, measures, qr));
  }
  return out;
}

/**
 * Run the base SQL with a small LIMIT to learn its columns + a few sample rows — the
 * web needs these to infer the field schema (the vinci `table` snapshot) the designer
 * shows. Not the chart data (that comes from `runCompute`); just a schema probe.
 */
export async function sampleBaseData(
  baseSql: string,
  datasourceId: string,
  limit = 50,
): Promise<{ columns: string[]; rows: QueryResult['rows'] }> {
  const base = assertReadOnly(baseSql);
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  const connector = await getConnectorById(datasourceId || 'builtin');
  const qr = await connector.runReadOnlySql(`SELECT * FROM (${base}) AS _dex_base LIMIT ${n}`, n);
  return { columns: qr.columns, rows: qr.rows };
}

/**
 * Run the chart's base query for its raw (unaggregated) rows — what the web exports
 * as CSV. Capped by the connector's row cap (`truncated` flags it).
 */
export async function fetchBaseRows(baseSql: string, datasourceId: string): Promise<QueryResult> {
  const connector = await getConnectorById(datasourceId || 'builtin');
  return connector.runReadOnlySql(assertReadOnly(baseSql));
}
