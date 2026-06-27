import { randomUUID } from 'node:crypto';
import { dexStore } from '../store';
import type { Cube } from './types';

/**
 * User-defined semantic models (v0.7; versioned drafts v3.1).
 *
 * The built-in semantic model (`model.ts`) stays a typed, hand-authored config.
 * This module lets the UI **author, draft, publish and remove** extra cubes
 * ("data models") at runtime, persisted in `dex.db` next to the data-source
 * registry + metadata overlay.
 *
 * Versioned drafts: each row carries up to two `Cube` definitions —
 * `published` (what the analyst agent can query) and `draft` (an in-progress
 * edit not yet visible to the agent). A model can be:
 *   - draft         — only a draft, never published (agent can't see it)
 *   - published     — a published version, no pending draft
 *   - draft_pending — published + an unpublished draft on top
 * `loadMergedModel()` (in `index.ts`) only ever reads the `published` slot, so
 * drafts are naturally invisible to the agent. User cubes are standalone (no
 * joins) and never `endorsed`.
 */

export type ModelStatus = 'draft' | 'published' | 'draft_pending';

export interface StoredModel {
  id: string;
  /** The base table the cube reads from (the current edit view's `cube.sql`). */
  baseTable: string;
  /** Current name (follows the draft when there's a pending edit). */
  name: string;
  /** Agent-visible version, or null if never published. */
  published: Cube | null;
  /** Pending unpublished edit, or null if there is none. */
  draft: Cube | null;
  createdAt: number;
  updatedAt: number;
}

export function statusOf(m: StoredModel): ModelStatus {
  if (!m.published) return 'draft';
  if (m.draft) return 'draft_pending';
  return 'published';
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = migrate();
  return schemaReady;
}

/**
 * Create the table (new DBs) and migrate older v0.7 rows (single `definition`
 * column) to the versioned shape. libsql has no `ADD COLUMN IF NOT EXISTS`, so
 * we probe `PRAGMA table_info` before each `ALTER`. The legacy `definition`
 * column is kept (it is `NOT NULL` on old DBs and we keep writing it for
 * back-compat); the versioned slots are the source of truth.
 */
async function migrate(): Promise<void> {
  // (Concurrency note: dexStore sets PRAGMA busy_timeout centrally in db/store.ts
  // so the writes below wait for the lock instead of failing with SQLITE_BUSY.)
  await dexStore.execute(
    `CREATE TABLE IF NOT EXISTS dex_semantic_models (
       id            TEXT PRIMARY KEY,
       name          TEXT NOT NULL UNIQUE,
       base_table    TEXT NOT NULL,
       definition    TEXT NOT NULL,
       published_def TEXT,
       draft_def     TEXT,
       created_at    INTEGER,
       updated_at    INTEGER
     )`,
  );
  const info = await dexStore.execute('PRAGMA table_info(dex_semantic_models)');
  const cols = new Set(
    (info.rows as unknown as Record<string, unknown>[]).map((r) => String(r.name)),
  );
  // Add the versioned columns to older v0.7 DBs. Tolerate a duplicate-column
  // error from a process that won a concurrent first-migration race.
  const addColumn = async (name: string, ddl: string) => {
    if (cols.has(name)) return;
    try {
      await dexStore.execute(`ALTER TABLE dex_semantic_models ADD COLUMN ${ddl}`);
    } catch (e) {
      if (!(e instanceof Error && /duplicate column/i.test(e.message))) throw e;
    }
  };
  const needsBackfill = !cols.has('published_def');
  await addColumn('published_def', 'published_def TEXT');
  await addColumn('draft_def', 'draft_def TEXT');
  await addColumn('updated_at', 'updated_at INTEGER');
  // Back-fill only on the first migration (legacy rows have always been
  // agent-visible → treat them as published). Skipping this in steady state
  // keeps migrate() write-free, so it never contends for the write lock.
  if (needsBackfill) {
    await dexStore
      .execute(
        `UPDATE dex_semantic_models
           SET published_def = definition
           WHERE published_def IS NULL AND definition IS NOT NULL`,
      )
      .catch(() => {});
  }
}

type Cell = unknown;

function parseCube(raw: Cell): Cube | null {
  if (raw == null) return null;
  try {
    return JSON.parse(String(raw)) as Cube;
  } catch {
    return null;
  }
}

function rowToStored(row: Record<string, Cell>): StoredModel | null {
  const draft = parseCube(row.draft_def);
  // Fall back to the legacy `definition` column for rows the migration hasn't
  // back-filled yet (defensive — migration runs before any read).
  const published =
    parseCube(row.published_def) ?? (row.draft_def == null ? parseCube(row.definition) : null);
  const view = draft ?? published;
  if (!view) return null; // empty/corrupt row — skip rather than crash the load
  return {
    id: String(row.id),
    name: String(row.name),
    baseTable: String(row.base_table ?? view.sql),
    published,
    draft,
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? row.created_at ?? 0),
  };
}

export async function listStoredModels(): Promise<StoredModel[]> {
  await ensureSchema();
  const res = await dexStore.execute('SELECT * FROM dex_semantic_models ORDER BY created_at ASC');
  return (res.rows as unknown as Record<string, Cell>[])
    .map(rowToStored)
    .filter((x): x is StoredModel => x !== null);
}

export async function getStoredModelByName(name: string): Promise<StoredModel | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_semantic_models WHERE name = ?',
    args: [name],
  });
  if (res.rows.length === 0) return null;
  return rowToStored(res.rows[0] as unknown as Record<string, Cell>);
}

/** Create a model. By default it's a draft (agent can't see it); pass
 *  `publish` to make it immediately published. */
export async function createModel(cube: Cube, publish = false): Promise<StoredModel> {
  await ensureSchema();
  const id = randomUUID();
  const now = Date.now();
  const published = publish ? cube : null;
  const draft = publish ? null : cube;
  await dexStore.execute({
    sql: `INSERT INTO dex_semantic_models
            (id, name, base_table, definition, published_def, draft_def, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      cube.name,
      cube.sql,
      JSON.stringify(cube),
      published ? JSON.stringify(published) : null,
      draft ? JSON.stringify(draft) : null,
      now,
      now,
    ],
  });
  return {
    id,
    name: cube.name,
    baseTable: cube.sql,
    published,
    draft,
    createdAt: now,
    updatedAt: now,
  };
}

/** Save a pending draft over a model, leaving the published version untouched.
 *  Returns null if no model with that name exists. The cube's name may differ
 *  (rename) — collision checks are the caller's job. */
export async function saveDraft(name: string, cube: Cube): Promise<StoredModel | null> {
  await ensureSchema();
  const existing = await getStoredModelByName(name);
  if (!existing) return null;
  const now = Date.now();
  await dexStore.execute({
    sql: `UPDATE dex_semantic_models
            SET name = ?, base_table = ?, definition = ?, draft_def = ?, updated_at = ?
          WHERE id = ?`,
    args: [cube.name, cube.sql, JSON.stringify(cube), JSON.stringify(cube), now, existing.id],
  });
  return { ...existing, name: cube.name, baseTable: cube.sql, draft: cube, updatedAt: now };
}

/** Publish a model: the published version becomes `cube` (or the pending draft
 *  if omitted) and the draft is cleared. Returns null if there's nothing to
 *  publish. */
export async function publishModel(name: string, cube?: Cube): Promise<StoredModel | null> {
  await ensureSchema();
  const existing = await getStoredModelByName(name);
  if (!existing) return null;
  const toPublish = cube ?? existing.draft ?? existing.published;
  if (!toPublish) return null;
  const now = Date.now();
  await dexStore.execute({
    sql: `UPDATE dex_semantic_models
            SET name = ?, base_table = ?, definition = ?, published_def = ?, draft_def = NULL, updated_at = ?
          WHERE id = ?`,
    args: [
      toPublish.name,
      toPublish.sql,
      JSON.stringify(toPublish),
      JSON.stringify(toPublish),
      now,
      existing.id,
    ],
  });
  return {
    ...existing,
    name: toPublish.name,
    baseTable: toPublish.sql,
    published: toPublish,
    draft: null,
    updatedAt: now,
  };
}

/** Discard the pending draft. If the model was never published, the whole row
 *  is removed (and null is returned); otherwise it reverts to the published
 *  version. */
export async function discardDraft(name: string): Promise<StoredModel | null> {
  await ensureSchema();
  const existing = await getStoredModelByName(name);
  if (!existing) return null;
  if (!existing.published) {
    await dexStore.execute({
      sql: 'DELETE FROM dex_semantic_models WHERE id = ?',
      args: [existing.id],
    });
    return null;
  }
  const now = Date.now();
  const pub = existing.published;
  await dexStore.execute({
    sql: `UPDATE dex_semantic_models
            SET name = ?, base_table = ?, definition = ?, draft_def = NULL, updated_at = ?
          WHERE id = ?`,
    args: [pub.name, pub.sql, JSON.stringify(pub), now, existing.id],
  });
  return { ...existing, name: pub.name, baseTable: pub.sql, draft: null, updatedAt: now };
}

/** Delete a model (both versions) by its current name. Returns true if removed. */
export async function deleteModel(name: string): Promise<boolean> {
  await ensureSchema();
  const existing = await getStoredModelByName(name);
  if (!existing) return false;
  await dexStore.execute({
    sql: 'DELETE FROM dex_semantic_models WHERE id = ?',
    args: [existing.id],
  });
  return true;
}
