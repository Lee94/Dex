// In-memory `apiService.compute` for vinci charts.
//
// VinciViewer/VinciDesigner don't take rows — they call `compute(queries)` where each
// query describes a grouped aggregation (dimensions in rows/columns, measures in values).
// Dex feeds it the already-fetched rows of an upstream SQL cell; this aggregates them in
// JS and returns vinci's columnar `ChartDataResult { fields, cols, origins, rowSize }`.
//
// Mapping (verified against the live engine): each query Column carries `id` (the encoding
// field id → result `fields[].id`), `field` (the ORIGIN column name → our row key), and
// `summary.type` (0/NONE = dimension to group by; otherwise an aggregation), verified
// against the live vinci engine.
import { SUMMARY_TYPES } from '@vinci/core';

type Row = Record<string, unknown>;

interface QueryColumn {
  columnType?: number;
  id: string;
  field?: string;
  name?: string;
  summary?: { type: number };
}
interface ComputeQuery {
  id: string;
  rows?: QueryColumn[];
  columns?: QueryColumn[];
  values?: QueryColumn[];
  layerType?: 'agg' | 'afterAgg' | 'filter';
}

const dataKey = (c: QueryColumn) => c.field ?? c.name ?? c.id;
const isDimension = (c: QueryColumn) =>
  (c.summary?.type ?? SUMMARY_TYPES.NONE) === SUMMARY_TYPES.NONE;

function aggregate(values: number[], summaryType: number): number {
  if (values.length === 0) return 0;
  switch (summaryType) {
    case SUMMARY_TYPES.AVERAGE:
      return values.reduce((a, b) => a + b, 0) / values.length;
    case SUMMARY_TYPES.MAX:
      return Math.max(...values);
    case SUMMARY_TYPES.MIN:
      return Math.min(...values);
    case SUMMARY_TYPES.COUNT:
      return values.length;
    default:
      return values.reduce((a, b) => a + b, 0); // SUM and the long tail
  }
}

/** Group `rows` by the query's dimension columns, aggregate its measure columns. */
function computeChart(query: ComputeQuery, rows: Row[]) {
  const all = [...(query.rows ?? []), ...(query.columns ?? []), ...(query.values ?? [])].filter(
    (c) => (c.columnType ?? 0) === 0 && dataKey(c),
  );
  const dims = all.filter(isDimension);
  const measures = all.filter((c) => !isDimension(c));

  // Group rows by the tuple of dimension values, preserving first-seen order.
  const groups = new Map<string, { keys: unknown[]; rows: Row[] }>();
  if (dims.length === 0) {
    groups.set('∑', { keys: [], rows }); // pure-measure query → one total group
  } else {
    for (const row of rows) {
      const keys = dims.map((d) => row[dataKey(d)]);
      const k = JSON.stringify(keys);
      let g = groups.get(k);
      if (!g) {
        g = { keys, rows: [] };
        groups.set(k, g);
      }
      g.rows.push(row);
    }
  }
  const ordered = [...groups.values()];

  const fieldDefs = [...dims, ...measures];
  const cols: string[][] = [];
  for (let i = 0; i < dims.length; i++) {
    cols.push(ordered.map((g) => String(g.keys[i] ?? '')));
  }
  for (const m of measures) {
    cols.push(
      ordered.map((g) =>
        String(
          aggregate(
            g.rows.map((r) => Number(r[dataKey(m)]) || 0),
            m.summary?.type ?? SUMMARY_TYPES.SUM,
          ),
        ),
      ),
    );
  }

  return {
    fields: fieldDefs.map((c) => ({ id: c.id, name: c.name ?? dataKey(c) })),
    cols,
    origins: cols.map((c) => c.slice()),
    rowSize: ordered.length,
    hasNext: false,
  };
}

/**
 * Build an `apiService` for VinciViewer/VinciDesigner backed by in-memory `rows`.
 * Returns one `ChartDataResult` per query (the chart shape vinci consumes).
 */
export function createVinciApiService(rows: Row[]) {
  return {
    compute: async (queries: ComputeQuery[]) => queries.map((q) => computeChart(q, rows)),
  };
}
