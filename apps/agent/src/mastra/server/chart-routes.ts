import { registerApiRoute } from '@mastra/core/server';
import { deleteChart, getChart, updateChartSpec } from '../db/charts';
import { fetchBaseRows, runCompute, sampleBaseData, type ComputeQuery } from '../db/chart-compute';
import { fail } from './http';

/**
 * Charts HTTP API (manual-edit / live-data redesign).
 *
 * A chart is a persisted backend entity (`db/charts.ts`); the web renders one by id
 * and computes its data live:
 *  - GET    /charts/:id          → the chart's snapshot `spec` (null until the web
 *                                  materializes it) + label, plus a small schema probe
 *                                  (columns + sample rows) for the vinci `table`.
 *  - POST   /charts/:id/compute  → translate the viewer's compute queries to SQL over
 *                                  the chart's base query and run them (live data).
 *  - PATCH  /charts/:id          → store the final snapshot `spec` (the web
 *                                  materializing the DSL seed, or a manual edit).
 *  - DELETE /charts/:id          → remove the chart.
 *
 * Independent of the agent stream, like the other root route modules. Raw SQL never
 * crosses the wire — the base query lives only in `dex.db`; the web sends opaque
 * compute-query objects, and every query still passes the read-only guard.
 */
export const chartRoutes = [
  registerApiRoute('/charts/:id', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const chart = await getChart(c.req.param('id'));
      if (!chart) return c.json(fail('Chart not found', 404), 404);
      try {
        const { columns, rows } = await sampleBaseData(chart.baseSql, chart.datasourceId);
        return c.json({
          id: chart.id,
          spec: chart.spec,
          label: chart.label,
          datasourceId: chart.datasourceId,
          columns,
          sampleRows: rows,
        });
      } catch (e) {
        // The base query can't run (source gone / table dropped). Still return the
        // definition so the web can show a clear "couldn't load data" state.
        return c.json({
          id: chart.id,
          spec: chart.spec,
          label: chart.label,
          datasourceId: chart.datasourceId,
          columns: [],
          sampleRows: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  }),

  registerApiRoute('/charts/:id/rows', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const chart = await getChart(c.req.param('id'));
      if (!chart) return c.json(fail('Chart not found', 404), 404);
      try {
        const result = await fetchBaseRows(chart.baseSql, chart.datasourceId);
        return c.json(result);
      } catch (e) {
        return c.json(fail(e instanceof Error ? e.message : String(e), 400), 400);
      }
    },
  }),

  registerApiRoute('/charts/:id/compute', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const chart = await getChart(c.req.param('id'));
      if (!chart) return c.json(fail('Chart not found', 404), 404);
      const body = (await c.req.json().catch(() => ({}))) as { queries?: unknown };
      const queries = Array.isArray(body.queries) ? (body.queries as ComputeQuery[]) : [];
      try {
        const { results, warnings } = await runCompute(chart.baseSql, chart.datasourceId, queries);
        // `warnings` lists anything we couldn't translate to SQL (a parameter filter, a
        // dynamic date, a percentile aggregate). The web ignores extra fields today; it's
        // here so the UI can surface "some sorting/filtering wasn't applied" later.
        return c.json({ results, warnings });
      } catch (e) {
        return c.json(fail(e instanceof Error ? e.message : String(e), 400), 400);
      }
    },
  }),

  registerApiRoute('/charts/:id', {
    method: 'PATCH',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { spec?: unknown };
      if (!body.spec || typeof body.spec !== 'object') {
        return c.json(fail('spec (an object) is required'), 400);
      }
      const chart = await updateChartSpec(c.req.param('id'), body.spec as Record<string, unknown>);
      if (!chart) return c.json(fail('Chart not found', 404), 404);
      return c.json({ chart });
    },
  }),

  registerApiRoute('/charts/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteChart(c.req.param('id'));
      if (!removed) return c.json(fail('Chart not found', 404), 404);
      return c.json({ ok: true });
    },
  }),
];
