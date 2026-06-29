import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Pins & reports (v3.4) — let analysis leave the conversation.
 *
 * A **pin** is a durable snapshot of a result (table) or chart the user saved
 * out of a thread; the ordered set of a thread's pins is its **report**, rendered
 * read-only and exportable on the web. Pins persist in `dex.db` (the snapshot
 * rides in `payload`, so a pin survives later edits to the conversation). The
 * agent never interprets a pin's payload — the web owns its shape.
 *
 * Single-user app: pins are keyed by `thread_id` (which is already resource-scoped
 * by Mastra memory), mirroring how the other Dex stores stay local-first.
 */

export type PinKind = 'table' | 'chart';

export interface Pin {
  id: string;
  threadId: string;
  kind: PinKind;
  title: string;
  /** Opaque render snapshot: a SqlResult for a table; { dsl, source, label } for a chart. */
  payload: Record<string, unknown>;
  position: number;
  createdAt: number;
}

export interface NewPinInput {
  threadId: string;
  kind: PinKind;
  title?: string;
  payload: Record<string, unknown>;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_pins (
           id         TEXT PRIMARY KEY,
           thread_id  TEXT NOT NULL,
           kind       TEXT NOT NULL,
           title      TEXT,
           payload    TEXT,
           position   INTEGER,
           created_at INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function parsePayload(raw: Cell): Record<string, unknown> {
  if (raw == null) return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rowToPin(row: Record<string, Cell>): Pin {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    kind: (String(row.kind) === 'chart' ? 'chart' : 'table') as PinKind,
    title: row.title == null ? '' : String(row.title),
    payload: parsePayload(row.payload),
    position: Number(row.position ?? 0),
    createdAt: Number(row.created_at ?? 0),
  };
}

/** A thread's pins, in display order. */
export async function listPins(threadId: string): Promise<Pin[]> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_pins WHERE thread_id = ? ORDER BY position ASC, created_at ASC',
    args: [threadId],
  });
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToPin);
}

/** Append a pin to the end of a thread's report. */
export async function createPin(input: NewPinInput): Promise<Pin> {
  await ensureSchema();
  const max = await dexStore.execute({
    sql: 'SELECT MAX(position) AS m FROM dex_pins WHERE thread_id = ?',
    args: [input.threadId],
  });
  const prev = (max.rows[0] as unknown as { m: Cell } | undefined)?.m;
  const position = (typeof prev === 'number' ? prev : Number(prev ?? -1)) + 1;
  const pin: Pin = {
    id: randomUUID(),
    threadId: input.threadId,
    kind: input.kind === 'chart' ? 'chart' : 'table',
    title: input.title?.trim() || (input.kind === 'chart' ? 'Chart' : 'Table'),
    payload: input.payload ?? {},
    position: Number.isFinite(position) ? position : 0,
    createdAt: Date.now(),
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_pins (id, thread_id, kind, title, payload, position, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      pin.id,
      pin.threadId,
      pin.kind,
      pin.title,
      JSON.stringify(pin.payload),
      pin.position,
      pin.createdAt,
    ],
  });
  return pin;
}

export async function deletePin(id: string): Promise<boolean> {
  await ensureSchema();
  const res = await dexStore.execute({ sql: 'DELETE FROM dex_pins WHERE id = ?', args: [id] });
  return (res.rowsAffected ?? 0) > 0;
}

/** Reorder a thread's pins to the given id order (ids not in the thread are ignored). */
export async function reorderPins(threadId: string, ids: string[]): Promise<Pin[]> {
  await ensureSchema();
  for (let i = 0; i < ids.length; i++) {
    await dexStore.execute({
      sql: 'UPDATE dex_pins SET position = ? WHERE id = ? AND thread_id = ?',
      args: [i, ids[i], threadId],
    });
  }
  return listPins(threadId);
}
