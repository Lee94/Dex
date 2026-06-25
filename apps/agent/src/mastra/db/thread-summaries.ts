import { dexStore } from './store';

/**
 * Past-thread summaries (v1.3) — a small recall surface so the agent can pull
 * context from prior threads (Hex `ReadPastThreadSummary`). The full
 * conversation lives in Mastra memory (`mastra.db`); this is a compact,
 * Dex-owned index of `(threadId → title + one-paragraph summary)` that the web
 * records when a thread answers, and `read_past_thread_summary` reads back.
 */

export interface ThreadSummary {
  threadId: string;
  title: string;
  summary: string;
  updatedAt: number;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_thread_summaries (
           thread_id  TEXT PRIMARY KEY,
           title      TEXT NOT NULL,
           summary    TEXT NOT NULL,
           updated_at INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function rowToSummary(row: Record<string, Cell>): ThreadSummary {
  return {
    threadId: String(row.thread_id),
    title: String(row.title),
    summary: String(row.summary),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export async function upsertThreadSummary(
  threadId: string,
  input: { title: string; summary: string },
): Promise<ThreadSummary> {
  await ensureSchema();
  const record: ThreadSummary = {
    threadId,
    title: input.title.trim() || 'Untitled thread',
    summary: input.summary.trim(),
    updatedAt: Date.now(),
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_thread_summaries (thread_id, title, summary, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(thread_id) DO UPDATE SET
            title = excluded.title, summary = excluded.summary, updated_at = excluded.updated_at`,
    args: [record.threadId, record.title, record.summary, record.updatedAt],
  });
  return record;
}

export async function getThreadSummary(threadId: string): Promise<ThreadSummary | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_thread_summaries WHERE thread_id = ?',
    args: [threadId],
  });
  if (res.rows.length === 0) return null;
  return rowToSummary(res.rows[0] as unknown as Record<string, Cell>);
}

export async function listThreadSummaries(limit = 20): Promise<ThreadSummary[]> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_thread_summaries ORDER BY updated_at DESC LIMIT ?',
    args: [limit],
  });
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToSummary);
}

export async function deleteThreadSummary(threadId: string): Promise<boolean> {
  await ensureSchema();
  const existing = await getThreadSummary(threadId);
  if (!existing) return false;
  await dexStore.execute({
    sql: 'DELETE FROM dex_thread_summaries WHERE thread_id = ?',
    args: [threadId],
  });
  return true;
}
