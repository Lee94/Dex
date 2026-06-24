import { randomUUID } from 'node:crypto';
import { dexStore } from '../store';
import type { Cube } from './types';

/**
 * User-defined semantic models (v0.7).
 *
 * The built-in semantic model (`model.ts`) stays a typed, hand-authored config.
 * This module lets the UI **add and remove** extra cubes ("data models") at
 * runtime, persisted in `dex.db` next to the data-source registry + metadata
 * overlay. A stored model is just a `Cube` (base table + measures + dimensions),
 * serialized as JSON; `loadMergedModel()` (in `index.ts`) merges them onto the
 * built-in cubes so the compiler, the agent's tools, and the Data Models UI all
 * see them. User cubes are standalone (no joins) and never `endorsed`.
 */

export interface StoredCube {
  id: string;
  /** The base table the cube reads from (must exist in the builtin warehouse). */
  baseTable: string;
  cube: Cube;
  createdAt: number;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_semantic_models (
           id          TEXT PRIMARY KEY,
           name        TEXT NOT NULL UNIQUE,
           base_table  TEXT NOT NULL,
           definition  TEXT NOT NULL,
           created_at  INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function rowToStored(row: Record<string, Cell>): StoredCube | null {
  try {
    const cube = JSON.parse(String(row.definition)) as Cube;
    return {
      id: String(row.id),
      baseTable: String(row.base_table),
      cube,
      createdAt: Number(row.created_at ?? 0),
    };
  } catch {
    // Tolerate a corrupt row rather than crashing the whole model load.
    return null;
  }
}

export async function listUserCubes(): Promise<StoredCube[]> {
  await ensureSchema();
  const res = await dexStore.execute('SELECT * FROM dex_semantic_models ORDER BY created_at ASC');
  return (res.rows as unknown as Record<string, Cell>[])
    .map(rowToStored)
    .filter((x): x is StoredCube => x !== null);
}

export async function getUserCubeByName(name: string): Promise<StoredCube | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_semantic_models WHERE name = ?',
    args: [name],
  });
  if (res.rows.length === 0) return null;
  return rowToStored(res.rows[0] as unknown as Record<string, Cell>);
}

export async function createUserCube(baseTable: string, cube: Cube): Promise<StoredCube> {
  await ensureSchema();
  const id = randomUUID();
  const createdAt = Date.now();
  await dexStore.execute({
    sql: `INSERT INTO dex_semantic_models (id, name, base_table, definition, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, cube.name, baseTable, JSON.stringify(cube), createdAt],
  });
  return { id, baseTable, cube, createdAt };
}

/** Delete a user cube by its cube name. Returns true if a row was removed. */
export async function deleteUserCube(name: string): Promise<boolean> {
  await ensureSchema();
  const existing = await getUserCubeByName(name);
  if (!existing) return false;
  await dexStore.execute({ sql: 'DELETE FROM dex_semantic_models WHERE name = ?', args: [name] });
  return true;
}
