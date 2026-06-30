import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Charts store (manual-edit / live-data redesign) — a chart is now a **persisted
 * backend entity**, not a DSL blob that rides inside a conversation tool result.
 *
 * The visualization flow persists `{ id, dsl, label, baseSql, datasourceId }` here
 * and returns only the `id`; the web renders a chart by fetching this record by id
 * and computing its data **live** (the `baseSql` is re-run on demand and the
 * viewer's aggregation is pushed down to SQL — see `db/chart-compute.ts`). Manual
 * edits in the VinciDesigner write the new `dsl` straight back here (`PATCH`), so
 * an edit survives reloads with no conversation rewriting.
 *
 * Like the other Dex stores it lives in `dex.db` and is keyed by a UUID. `base_sql`
 * is the upstream **unaggregated** query the analyst ran for the bound result;
 * `datasource_id` is the registered connection it ran against ('builtin' default).
 * `thread_id` is optional bookkeeping (tools can't read the ambient thread id).
 */

export interface Chart {
  id: string;
  /** The vinci surface DSL (a SurfaceDoc); opaque to the agent, owned by the web. */
  dsl: Record<string, unknown>;
  label: string;
  /** The upstream unaggregated SQL the chart's data is computed from (live). */
  baseSql: string;
  /** The registered data connection the baseSql runs against ('builtin' default). */
  datasourceId: string;
  threadId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NewChartInput {
  /** Use the build_chart cellId so the conversation's [result:<id>] embed resolves. */
  id?: string;
  dsl: Record<string, unknown>;
  label?: string;
  baseSql: string;
  datasourceId?: string;
  threadId?: string;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_charts (
           id            TEXT PRIMARY KEY,
           dsl           TEXT,
           label         TEXT,
           base_sql      TEXT,
           datasource_id TEXT,
           thread_id     TEXT,
           created_at    INTEGER,
           updated_at    INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function parseDsl(raw: Cell): Record<string, unknown> {
  if (raw == null) return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rowToChart(row: Record<string, Cell>): Chart {
  return {
    id: String(row.id),
    dsl: parseDsl(row.dsl),
    label: row.label == null ? '' : String(row.label),
    baseSql: row.base_sql == null ? '' : String(row.base_sql),
    datasourceId: row.datasource_id == null ? 'builtin' : String(row.datasource_id),
    threadId: row.thread_id == null ? undefined : String(row.thread_id),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export async function getChart(id: string): Promise<Chart | null> {
  await ensureSchema();
  const res = await dexStore.execute({ sql: 'SELECT * FROM dex_charts WHERE id = ?', args: [id] });
  const row = res.rows[0] as unknown as Record<string, Cell> | undefined;
  return row ? rowToChart(row) : null;
}

/** Persist a chart the visualization flow just built. */
export async function createChart(input: NewChartInput): Promise<Chart> {
  await ensureSchema();
  const now = Date.now();
  const chart: Chart = {
    id: input.id ?? randomUUID(),
    dsl: input.dsl ?? {},
    label: input.label?.trim() || 'Chart',
    baseSql: input.baseSql,
    datasourceId: input.datasourceId?.trim() || 'builtin',
    threadId: input.threadId,
    createdAt: now,
    updatedAt: now,
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_charts (id, dsl, label, base_sql, datasource_id, thread_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            dsl = excluded.dsl,
            label = excluded.label,
            base_sql = excluded.base_sql,
            datasource_id = excluded.datasource_id,
            updated_at = excluded.updated_at`,
    args: [
      chart.id,
      JSON.stringify(chart.dsl),
      chart.label,
      chart.baseSql,
      chart.datasourceId,
      chart.threadId ?? null,
      chart.createdAt,
      chart.updatedAt,
    ],
  });
  return chart;
}

/** Overwrite a chart's DSL (a manual VinciDesigner edit, or an AI revision). */
export async function updateChartDsl(
  id: string,
  dsl: Record<string, unknown>,
): Promise<Chart | null> {
  await ensureSchema();
  const now = Date.now();
  const res = await dexStore.execute({
    sql: 'UPDATE dex_charts SET dsl = ?, updated_at = ? WHERE id = ?',
    args: [JSON.stringify(dsl), now, id],
  });
  if ((res.rowsAffected ?? 0) === 0) return null;
  return getChart(id);
}

export async function deleteChart(id: string): Promise<boolean> {
  await ensureSchema();
  const res = await dexStore.execute({ sql: 'DELETE FROM dex_charts WHERE id = ?', args: [id] });
  return (res.rowsAffected ?? 0) > 0;
}
