import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Charts store (manual-edit / live-data redesign). A chart is a **persisted backend
 * entity**, not a DSL blob in the conversation.
 *
 * What's stored is the **final vinci snapshot JSON** (`spec`) — the exact thing
 * `VinciViewer`/`VinciDesigner` render from — never the surface DSL. The agent can
 * only author a surface DSL and has no vinci compiler, so it creates the row with
 * just the `base_sql` (+ label/datasource) and a **null** spec; the web materializes
 * the spec on first render (compiles the DSL seed it carries in the conversation),
 * `PATCH`es it here, and every manual edit stores the edited snapshot directly. So
 * `dex_charts` only ever holds the final JSON — the DSL never lands in this table.
 *
 * `base_sql` is the upstream **unaggregated** query the chart's data is computed from
 * live (see `db/chart-compute.ts`); `datasource_id` is the connection it runs against
 * ('builtin' default). `thread_id` is optional bookkeeping.
 */

export interface Chart {
  id: string;
  /** The final vinci model snapshot (the renderable JSON); null until materialized. */
  spec: Record<string, unknown> | null;
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
           spec          TEXT,
           label         TEXT,
           base_sql      TEXT,
           datasource_id TEXT,
           thread_id     TEXT,
           created_at    INTEGER,
           updated_at    INTEGER
         )`,
      )
      // Defensive: a dex.db created during the earlier (dsl-storing) iteration has a
      // `dsl` column but no `spec`. Add it so the new code path doesn't error. Ignore
      // the "duplicate column" error on fresh/already-migrated DBs.
      .then(() => dexStore.execute('ALTER TABLE dex_charts ADD COLUMN spec TEXT').catch(() => {}))
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function parseSpec(raw: Cell): Record<string, unknown> | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function rowToChart(row: Record<string, Cell>): Chart {
  return {
    id: String(row.id),
    spec: parseSpec(row.spec),
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

/**
 * Persist a chart the visualization flow just built (spec starts null — the web
 * materializes it). Re-creating the same id refreshes its base SQL/label but
 * **preserves** an already-materialized spec.
 */
export async function createChart(input: NewChartInput): Promise<Chart> {
  await ensureSchema();
  const now = Date.now();
  const chart: Chart = {
    id: input.id ?? randomUUID(),
    spec: null,
    label: input.label?.trim() || 'Chart',
    baseSql: input.baseSql,
    datasourceId: input.datasourceId?.trim() || 'builtin',
    threadId: input.threadId,
    createdAt: now,
    updatedAt: now,
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_charts (id, spec, label, base_sql, datasource_id, thread_id, created_at, updated_at)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            base_sql = excluded.base_sql,
            datasource_id = excluded.datasource_id,
            updated_at = excluded.updated_at`,
    args: [
      chart.id,
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

/** Store a chart's final snapshot JSON (the web materializing it, or a manual edit). */
export async function updateChartSpec(
  id: string,
  spec: Record<string, unknown>,
): Promise<Chart | null> {
  await ensureSchema();
  const now = Date.now();
  const res = await dexStore.execute({
    sql: 'UPDATE dex_charts SET spec = ?, updated_at = ? WHERE id = ?',
    args: [JSON.stringify(spec), now, id],
  });
  if ((res.rowsAffected ?? 0) === 0) return null;
  return getChart(id);
}

export async function deleteChart(id: string): Promise<boolean> {
  await ensureSchema();
  const res = await dexStore.execute({ sql: 'DELETE FROM dex_charts WHERE id = ?', args: [id] });
  return (res.rowsAffected ?? 0) > 0;
}
