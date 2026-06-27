import { randomUUID } from 'node:crypto';
import { dexStore } from './store';
import type { QueryResult } from './types';

/**
 * Scheduled tasks (v1.3) — turn a saved query into a living artifact.
 *
 * A task re-runs a read-only SQL query on a cron, optionally **alerts** when a
 * scalar crosses a threshold (or changes), and **delivers** a summary
 * (Slack/webhook). Tasks persist in `dex.db`; re-runs go through the same read-only
 * execution path as everything else (see `task-runner.ts`). Delivery + alerting
 * start simple by design (no rules engine).
 */

export type TaskKind = 'sql';
export type AlertOp = 'gt' | 'lt' | 'ne' | 'changed';
export type DeliveryChannel = 'none' | 'slack' | 'webhook';
export type RunStatus = 'ok' | 'alert' | 'error';

export interface TaskAlert {
  /** Result column to read the scalar from; defaults to the first numeric cell. */
  column?: string;
  op: AlertOp;
  /** Threshold for gt/lt/ne. Ignored for `changed`. */
  threshold?: number;
}

export interface TaskDelivery {
  channel: DeliveryChannel;
  /** Webhook/Slack URL. Falls back to env SLACK_WEBHOOK_URL for `slack`. */
  url?: string;
}

export interface Task {
  id: string;
  name: string;
  kind: TaskKind;
  sql?: string;
  cron: string;
  enabled: boolean;
  delivery: TaskDelivery;
  alert: TaskAlert | null;
  lastRunAt?: number;
  lastStatus?: RunStatus;
  lastValue?: number | null;
  lastError?: string;
  lastResult?: QueryResult | null;
  createdAt: number;
}

export interface NewTaskInput {
  name: string;
  kind: TaskKind;
  sql?: string;
  cron: string;
  enabled?: boolean;
  delivery?: TaskDelivery;
  alert?: TaskAlert | null;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_tasks (
           id          TEXT PRIMARY KEY,
           name        TEXT NOT NULL,
           kind        TEXT NOT NULL,
           sql         TEXT,
           cron        TEXT NOT NULL,
           enabled     INTEGER NOT NULL DEFAULT 1,
           delivery    TEXT,
           alert       TEXT,
           last_run_at INTEGER,
           last_status TEXT,
           last_value  REAL,
           last_error  TEXT,
           last_result TEXT,
           created_at  INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function parseJson<T>(raw: Cell, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function rowToTask(row: Record<string, Cell>): Task {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: String(row.kind) as TaskKind,
    sql: row.sql == null ? undefined : String(row.sql),
    cron: String(row.cron),
    enabled: Number(row.enabled) === 1,
    delivery: parseJson<TaskDelivery>(row.delivery, { channel: 'none' }),
    alert: parseJson<TaskAlert | null>(row.alert, null),
    lastRunAt: row.last_run_at == null ? undefined : Number(row.last_run_at),
    lastStatus: row.last_status == null ? undefined : (String(row.last_status) as RunStatus),
    lastValue: row.last_value == null ? undefined : Number(row.last_value),
    lastError: row.last_error == null ? undefined : String(row.last_error),
    lastResult: parseJson<QueryResult | null>(row.last_result, null),
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function listTasks(): Promise<Task[]> {
  await ensureSchema();
  const res = await dexStore.execute('SELECT * FROM dex_tasks ORDER BY created_at DESC');
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToTask);
}

export async function getTask(id: string): Promise<Task | null> {
  await ensureSchema();
  const res = await dexStore.execute({ sql: 'SELECT * FROM dex_tasks WHERE id = ?', args: [id] });
  if (res.rows.length === 0) return null;
  return rowToTask(res.rows[0] as unknown as Record<string, Cell>);
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  await ensureSchema();
  const task: Task = {
    id: randomUUID(),
    name: input.name.trim() || 'Untitled task',
    kind: input.kind,
    sql: input.sql,
    cron: input.cron.trim(),
    enabled: input.enabled ?? true,
    delivery: input.delivery ?? { channel: 'none' },
    alert: input.alert ?? null,
    createdAt: Date.now(),
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_tasks
            (id, name, kind, sql, cron, enabled, delivery, alert, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      task.id,
      task.name,
      task.kind,
      task.sql ?? null,
      task.cron,
      task.enabled ? 1 : 0,
      JSON.stringify(task.delivery),
      task.alert ? JSON.stringify(task.alert) : null,
      task.createdAt,
    ],
  });
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<Task, 'name' | 'cron' | 'enabled' | 'delivery' | 'alert' | 'sql'>>,
): Promise<Task | null> {
  const current = await getTask(id);
  if (!current) return null;
  const merged: Task = {
    ...current,
    name: patch.name?.trim() || current.name,
    cron: patch.cron?.trim() || current.cron,
    enabled: patch.enabled ?? current.enabled,
    delivery: patch.delivery ?? current.delivery,
    alert: patch.alert !== undefined ? patch.alert : current.alert,
    sql: patch.sql !== undefined ? patch.sql : current.sql,
  };
  await dexStore.execute({
    sql: `UPDATE dex_tasks SET name = ?, cron = ?, enabled = ?, delivery = ?, alert = ?, sql = ?
          WHERE id = ?`,
    args: [
      merged.name,
      merged.cron,
      merged.enabled ? 1 : 0,
      JSON.stringify(merged.delivery),
      merged.alert ? JSON.stringify(merged.alert) : null,
      merged.sql ?? null,
      id,
    ],
  });
  return merged;
}

export async function deleteTask(id: string): Promise<boolean> {
  await ensureSchema();
  const existing = await getTask(id);
  if (!existing) return false;
  await dexStore.execute({ sql: 'DELETE FROM dex_tasks WHERE id = ?', args: [id] });
  return true;
}

/** Persist the outcome of a run. */
export async function recordRun(
  id: string,
  run: { status: RunStatus; value: number | null; error?: string; result?: QueryResult | null },
): Promise<void> {
  await ensureSchema();
  await dexStore.execute({
    sql: `UPDATE dex_tasks SET last_run_at = ?, last_status = ?, last_value = ?, last_error = ?, last_result = ?
          WHERE id = ?`,
    args: [
      Date.now(),
      run.status,
      run.value,
      run.error ?? null,
      run.result ? JSON.stringify(run.result) : null,
      id,
    ],
  });
}
