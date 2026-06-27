import { runReadOnlySql } from './queries';
import { deliverResult } from './delivery';
import { recordRun, type Task, type TaskAlert, type RunStatus } from './tasks';
import type { QueryResult } from './types';

/**
 * Task runner (v1.3) — executes a scheduled task through the **read-only** path
 * (the same `runReadOnlySql` everything else uses), evaluates its alert, delivers
 * a summary, and records the run. Pure-ish: it touches the DB (record) + delivery
 * seam (mockable), so it's testable without the scheduler or the network.
 */

function numericOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Pull the scalar an alert watches: a named column, else the first numeric cell. */
export function extractScalar(result: QueryResult, column?: string): number | null {
  const row = result.rows[0];
  if (!row) return null;
  if (column && column in row) return numericOf(row[column]);
  for (const col of result.columns) {
    const n = numericOf(row[col]);
    if (n !== null) return n;
  }
  return null;
}

/** Has the alert condition been met? */
export function evaluateAlert(
  alert: TaskAlert | null,
  value: number | null,
  lastValue: number | null | undefined,
): boolean {
  if (!alert || value === null) return false;
  switch (alert.op) {
    case 'gt':
      return alert.threshold !== undefined && value > alert.threshold;
    case 'lt':
      return alert.threshold !== undefined && value < alert.threshold;
    case 'ne':
      return alert.threshold !== undefined && value !== alert.threshold;
    case 'changed':
      return lastValue != null && value !== lastValue;
    default:
      return false;
  }
}

/** Resolve a task to the read-only SQL it should run. */
function resolveTaskSql(task: Task): string {
  if (!task.sql?.trim()) throw new Error('Task has no SQL to run.');
  return task.sql;
}

export interface TaskRun {
  status: RunStatus;
  value: number | null;
  alertFired: boolean;
  result: QueryResult | null;
  error?: string;
}

/**
 * Run a task once: execute read-only, evaluate the alert, deliver, record.
 * Never throws — a failure is captured as an `error` run so the scheduler keeps going.
 */
export async function runTask(task: Task): Promise<TaskRun> {
  try {
    const sql = resolveTaskSql(task);
    const result = await runReadOnlySql(sql);
    const value = extractScalar(result, task.alert?.column);
    const alertFired = evaluateAlert(task.alert, value, task.lastValue);
    const status: RunStatus = alertFired ? 'alert' : 'ok';

    const valueText = value === null ? 'no value' : `${value.toLocaleString()}`;
    const text = alertFired
      ? `ALERT — ${valueText} (${result.rowCount} rows)`
      : `${valueText} (${result.rowCount} rows)`;
    // Deliver always on an alert; for ok runs only when a channel is set.
    if (alertFired || task.delivery.channel !== 'none') {
      await deliverResult(task.delivery, { taskName: task.name, status, text }).catch(() => {});
    }

    await recordRun(task.id, { status, value, result });
    return { status, value, alertFired, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordRun(task.id, { status: 'error', value: null, error, result: null });
    return { status: 'error', value: null, alertFired: false, result: null, error };
  }
}
