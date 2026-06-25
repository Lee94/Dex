import { apiFetch } from '@/lib/apiClient';

/**
 * Tasks client (v1.3). Talks to the agent's root `/tasks` + `/thread-summaries`
 * routes (apps/agent/src/mastra/server/task-routes.ts): schedule a read-only
 * query to re-run on a cron, with optional alerting + delivery; record a thread
 * summary the agent can recall. Same thin `apiFetch` pattern as the other clients.
 */

export type AlertOp = 'gt' | 'lt' | 'ne' | 'changed';
export type DeliveryChannel = 'none' | 'slack' | 'webhook';
export type RunStatus = 'ok' | 'alert' | 'error';

export interface TaskAlert {
  column?: string;
  op: AlertOp;
  threshold?: number;
}

export interface TaskDelivery {
  channel: DeliveryChannel;
  url?: string;
}

export interface Task {
  id: string;
  name: string;
  kind: 'sql' | 'notebook';
  sql?: string;
  cron: string;
  enabled: boolean;
  delivery: TaskDelivery;
  alert: TaskAlert | null;
  lastRunAt?: number;
  lastStatus?: RunStatus;
  lastValue?: number | null;
  lastError?: string;
  createdAt: number;
}

export interface NewTask {
  name: string;
  sql: string;
  cron: string;
  alert?: TaskAlert | null;
  delivery?: TaskDelivery;
  enabled?: boolean;
}

export interface TaskRun {
  status: RunStatus;
  value: number | null;
  alertFired: boolean;
  error?: string;
}

export async function listTasks(): Promise<Task[]> {
  const { tasks } = await apiFetch<{ tasks: Task[] }>('/tasks');
  return tasks;
}

export async function createTask(input: NewTask): Promise<Task> {
  const { task } = await apiFetch<{ task: Task }>('/tasks', {
    method: 'POST',
    body: JSON.stringify({ kind: 'sql', ...input }),
  });
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<Task, 'name' | 'cron' | 'enabled' | 'delivery' | 'alert' | 'sql'>>,
): Promise<Task> {
  const { task } = await apiFetch<{ task: Task }>(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  await apiFetch(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function runTaskNow(id: string): Promise<TaskRun> {
  const { run } = await apiFetch<{ run: TaskRun }>(`/tasks/${encodeURIComponent(id)}/run`, {
    method: 'POST',
  });
  return run;
}

/** Record a one-line summary for a finished thread, for later recall. Best-effort. */
export async function saveThreadSummary(
  threadId: string,
  title: string,
  summary: string,
): Promise<void> {
  await apiFetch(`/thread-summaries/${encodeURIComponent(threadId)}`, {
    method: 'PUT',
    body: JSON.stringify({ title, summary }),
  });
}
