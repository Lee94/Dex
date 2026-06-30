import { apiFetch } from '@/lib/apiClient';
import type { SqlResult } from '@/types';

/**
 * Charts client (manual-edit / live-data redesign). Talks to the agent's root
 * `/charts/:id` REST routes (apps/agent/src/mastra/server/chart-routes.ts) via the
 * shared `apiFetch`, mirroring lib/reports.ts / lib/dataSources.ts.
 *
 * A chart is a backend entity: we fetch its DSL + a schema probe by id (`getChart`),
 * compute its data live by forwarding the vinci viewer's compute queries to the
 * server (`createServerApiService` → POST `/compute`), and persist a manual edit by
 * writing the new DSL back (`updateChartDsl` → PATCH). No raw rows or SQL cross the
 * wire here — the server holds the base query and pushes aggregation down to SQL.
 */

export type Row = Record<string, unknown>;

/** The chart definition + a small schema probe for building the vinci table snapshot. */
export interface ChartDef {
  id: string;
  /** The final vinci snapshot JSON (the renderable spec); null until materialized. */
  spec?: Record<string, unknown> | null;
  label?: string;
  datasourceId?: string;
  /** Columns of the base query (for the field schema the designer shows). */
  columns: string[];
  /** A few base-query rows, for inferring column types. NOT the chart data. */
  sampleRows: Row[];
  /** Set when the base query couldn't run (source gone / table dropped). */
  error?: string;
}

/** One vinci columnar compute result (matches db/chart-compute.ts `ChartDataResult`). */
export interface ChartDataResult {
  fields: Array<{ id: string; name: string }>;
  cols: string[][];
  origins: string[][];
  rowSize: number;
  hasNext: boolean;
}

export async function getChart(id: string): Promise<ChartDef> {
  return apiFetch<ChartDef>(`/charts/${encodeURIComponent(id)}`);
}

export async function computeChart(id: string, queries: unknown[]): Promise<ChartDataResult[]> {
  const { results, warnings } = await apiFetch<{ results: ChartDataResult[]; warnings?: string[] }>(
    `/charts/${encodeURIComponent(id)}/compute`,
    { method: 'POST', body: JSON.stringify({ queries }) },
  );
  // The backend translates the viewer's sort/filter/grain/calc to SQL; anything it
  // can't express (a parameter filter, a dynamic date, a percentile) comes back here so
  // it isn't silently dropped. No UI surface for it yet — log for now.
  if (warnings && warnings.length > 0) {
    console.warn(`[chart ${id}] some compute options weren't applied:`, warnings);
  }
  return results;
}

/** The chart's raw (unaggregated) base rows — what the web exports as CSV. */
export async function getChartRows(id: string): Promise<SqlResult> {
  return apiFetch<SqlResult>(`/charts/${encodeURIComponent(id)}/rows`);
}

/** Store the chart's final snapshot JSON (web materialization or a manual edit). */
export async function updateChartSpec(id: string, spec: Record<string, unknown>): Promise<void> {
  await apiFetch(`/charts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ spec }),
  });
}

/**
 * An `apiService` for the vinci VinciViewer / VinciDesigner backed by the chart's
 * server-side base query. Each `compute(queries)` call pushes the viewer's grouping
 * + aggregation down to SQL and returns fresh data — the live-data path that
 * replaces the old in-browser `createVinciApiService(rows)`.
 */
export function createServerApiService(id: string) {
  return {
    compute: async (queries: unknown[]) => computeChart(id, queries),
  };
}
