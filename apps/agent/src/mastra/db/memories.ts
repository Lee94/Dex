import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Durable agent memory (v0.9).
 *
 * Per-thread conversation memory already lives in Mastra (`mastra.db`). This is
 * different: confirmed, cross-thread **user preferences** ("always show revenue
 * in thousands", "fiscal year starts in February") that the agent should honor
 * in every future thread. They're keyed by `resourceId` (the single-user
 * RESOURCE_ID the web client uses) and folded into the agent's system prompt on
 * every turn — see the dynamic instructions in `agents/analyst.ts`.
 *
 * Saves are explicit only: the `save_memory` tool persists a preference the user
 * has confirmed. Nothing is extracted silently.
 */

/** The single-user resource id (mirrors the web client's RESOURCE_ID). */
export const DEFAULT_RESOURCE_ID = 'dex-local-user';

export interface Memory {
  id: string;
  resourceId: string;
  content: string;
  createdAt: number;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_memories (
           id          TEXT PRIMARY KEY,
           resource_id TEXT NOT NULL,
           content     TEXT NOT NULL,
           created_at  INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function rowToMemory(row: Record<string, Cell>): Memory {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    content: String(row.content),
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function listMemories(resourceId = DEFAULT_RESOURCE_ID): Promise<Memory[]> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_memories WHERE resource_id = ? ORDER BY created_at ASC',
    args: [resourceId],
  });
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToMemory);
}

/**
 * Persist a confirmed preference. Idempotent on identical content for a resource
 * (re-saving the same fact returns the existing row rather than duplicating it).
 */
export async function saveMemory(
  content: string,
  resourceId = DEFAULT_RESOURCE_ID,
): Promise<Memory> {
  await ensureSchema();
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Cannot save an empty memory.');

  const existing = await dexStore.execute({
    sql: 'SELECT * FROM dex_memories WHERE resource_id = ? AND content = ?',
    args: [resourceId, trimmed],
  });
  if (existing.rows.length > 0) {
    return rowToMemory(existing.rows[0] as unknown as Record<string, Cell>);
  }

  const memory: Memory = {
    id: randomUUID(),
    resourceId,
    content: trimmed,
    createdAt: Date.now(),
  };
  await dexStore.execute({
    sql: 'INSERT INTO dex_memories (id, resource_id, content, created_at) VALUES (?, ?, ?, ?)',
    args: [memory.id, memory.resourceId, memory.content, memory.createdAt],
  });
  return memory;
}

export async function deleteMemory(id: string): Promise<boolean> {
  await ensureSchema();
  const before = await dexStore.execute({
    sql: 'SELECT id FROM dex_memories WHERE id = ?',
    args: [id],
  });
  if (before.rows.length === 0) return false;
  await dexStore.execute({ sql: 'DELETE FROM dex_memories WHERE id = ?', args: [id] });
  return true;
}

/** Remove every memory for a resource (used by the smoke test cleanup). */
export async function deleteMemoriesForResource(resourceId: string): Promise<void> {
  await ensureSchema();
  await dexStore.execute({
    sql: 'DELETE FROM dex_memories WHERE resource_id = ?',
    args: [resourceId],
  });
}
