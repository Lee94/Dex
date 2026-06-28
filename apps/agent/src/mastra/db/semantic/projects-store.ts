import { randomUUID } from 'node:crypto';
import { dexStore } from '../store';

/**
 * User-defined semantic **projects** (v3.3).
 *
 * Beyond the single built-in `dex` project (the hand-authored model + any user
 * cubes scoped to it), the UI can create extra semantic projects at runtime,
 * each **bound to a data connection** (`sourceId` = a `dex_datasources` id, or
 * `builtin`). A project is just a container + a source binding; its models live
 * in `dex_semantic_models` keyed by `project_id`. The built-in `dex` project is
 * synthesized in `server/routes.ts` and is never stored here.
 */

export interface StoredProject {
  id: string;
  name: string;
  description: string | null;
  /** The data connection this project's models are built from. */
  sourceId: string;
  createdAt: number;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_semantic_projects (
           id          TEXT PRIMARY KEY,
           name        TEXT NOT NULL,
           description TEXT,
           source_id   TEXT NOT NULL,
           created_at  INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function rowToProject(row: Record<string, Cell>): StoredProject {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    sourceId: String(row.source_id),
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function listStoredProjects(): Promise<StoredProject[]> {
  await ensureSchema();
  const res = await dexStore.execute('SELECT * FROM dex_semantic_projects ORDER BY created_at ASC');
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToProject);
}

export async function getStoredProject(id: string): Promise<StoredProject | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_semantic_projects WHERE id = ?',
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return rowToProject(res.rows[0] as unknown as Record<string, Cell>);
}

export async function createProject(input: {
  name: string;
  description?: string | null;
  sourceId: string;
}): Promise<StoredProject> {
  await ensureSchema();
  const id = `proj_${randomUUID().slice(0, 8)}`;
  const now = Date.now();
  await dexStore.execute({
    sql: `INSERT INTO dex_semantic_projects (id, name, description, source_id, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, input.name, input.description ?? null, input.sourceId, now],
  });
  return {
    id,
    name: input.name,
    description: input.description ?? null,
    sourceId: input.sourceId,
    createdAt: now,
  };
}

export async function deleteProject(id: string): Promise<boolean> {
  await ensureSchema();
  const existing = await getStoredProject(id);
  if (!existing) return false;
  await dexStore.execute({ sql: 'DELETE FROM dex_semantic_projects WHERE id = ?', args: [id] });
  return true;
}
