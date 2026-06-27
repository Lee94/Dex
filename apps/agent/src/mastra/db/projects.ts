import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Projects (v3.0) — a container that groups Threads and carries **shared context**
 * for them: project-level instructions plus bound data sources that every thread in
 * the project inherits. Projects persist in `dex.db`; thread membership itself does
 * NOT live here — a thread records its `projectId` in its Mastra thread metadata,
 * so listing a project's threads is a metadata-filtered memory query on the web.
 *
 * Single-user app: rows are scoped by `resource_id` (mirrors the web's RESOURCE_ID)
 * so the model is multi-user ready, but the routes default to the local resource.
 */

export const DEFAULT_RESOURCE_ID = 'dex-local-user';

/** A data-source/table/model attachment bound to a project. Shape mirrors the web's
 *  `Attachment`; the agent stores it verbatim and never interprets it. */
export type ProjectAttachment = Record<string, unknown>;

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Project-level instructions every thread in the project inherits. */
  instructions: string;
  /** Data sources/tables/models bound to the project (inherited by its threads). */
  attachments: ProjectAttachment[];
  resourceId: string;
  createdAt: number;
  updatedAt: number;
}

export interface NewProjectInput {
  name: string;
  description?: string;
  instructions?: string;
  attachments?: ProjectAttachment[];
  resourceId?: string;
}

export interface ProjectPatch {
  name?: string;
  description?: string;
  instructions?: string;
  attachments?: ProjectAttachment[];
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_projects (
           id           TEXT PRIMARY KEY,
           name         TEXT NOT NULL,
           description  TEXT,
           instructions TEXT,
           attachments  TEXT,
           resource_id  TEXT NOT NULL,
           created_at   INTEGER,
           updated_at   INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function parseAttachments(raw: Cell): ProjectAttachment[] {
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? (parsed as ProjectAttachment[]) : [];
  } catch {
    return [];
  }
}

function rowToProject(row: Record<string, Cell>): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description == null ? '' : String(row.description),
    instructions: row.instructions == null ? '' : String(row.instructions),
    attachments: parseAttachments(row.attachments),
    resourceId: String(row.resource_id),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export async function listProjects(resourceId = DEFAULT_RESOURCE_ID): Promise<Project[]> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_projects WHERE resource_id = ? ORDER BY updated_at DESC',
    args: [resourceId],
  });
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToProject);
}

export async function getProject(id: string): Promise<Project | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_projects WHERE id = ?',
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return rowToProject(res.rows[0] as unknown as Record<string, Cell>);
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  await ensureSchema();
  const now = Date.now();
  const project: Project = {
    id: randomUUID(),
    name: input.name.trim() || 'Untitled project',
    description: input.description?.trim() ?? '',
    instructions: input.instructions ?? '',
    attachments: input.attachments ?? [],
    resourceId: input.resourceId ?? DEFAULT_RESOURCE_ID,
    createdAt: now,
    updatedAt: now,
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_projects
            (id, name, description, instructions, attachments, resource_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      project.id,
      project.name,
      project.description,
      project.instructions,
      JSON.stringify(project.attachments),
      project.resourceId,
      project.createdAt,
      project.updatedAt,
    ],
  });
  return project;
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<Project | null> {
  const current = await getProject(id);
  if (!current) return null;
  const merged: Project = {
    ...current,
    name: patch.name?.trim() || current.name,
    description: patch.description !== undefined ? patch.description : current.description,
    instructions: patch.instructions !== undefined ? patch.instructions : current.instructions,
    attachments: patch.attachments !== undefined ? patch.attachments : current.attachments,
    updatedAt: Date.now(),
  };
  await dexStore.execute({
    sql: `UPDATE dex_projects
          SET name = ?, description = ?, instructions = ?, attachments = ?, updated_at = ?
          WHERE id = ?`,
    args: [
      merged.name,
      merged.description,
      merged.instructions,
      JSON.stringify(merged.attachments),
      merged.updatedAt,
      id,
    ],
  });
  return merged;
}

export async function deleteProject(id: string): Promise<boolean> {
  await ensureSchema();
  const existing = await getProject(id);
  if (!existing) return false;
  await dexStore.execute({ sql: 'DELETE FROM dex_projects WHERE id = ?', args: [id] });
  return true;
}
