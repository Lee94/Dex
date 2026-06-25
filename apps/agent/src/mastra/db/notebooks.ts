import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Notebook persistence (v2.0 — NotebookEditor).
 *
 * A notebook is an ordered list of cells the user co-authors with the agent.
 * For the MVP a cell is a SQL cell (its `source` is the query); the `kind`
 * field keeps the shape extensible (text/semantic/ai cells can be added later
 * without a migration). The whole notebook — including its cells — is stored as
 * a single JSON document in `dex.db`, mirroring the user-cube store
 * (`db/semantic/store.ts`): cells are edited/reordered as a unit, the document
 * is small, and an atomic whole-notebook save is the simplest correct model.
 *
 * Only the cell *source* is persisted; a cell's run result is runtime state
 * (re-run to repopulate), so results never bloat the store or go stale on disk.
 * Execution itself goes through the read-only connector path (see
 * `server/notebook-routes.ts`), never this module.
 */

export type CellKind = 'sql';

export interface NotebookCell {
  id: string;
  kind: CellKind;
  /** The cell's source — for a SQL cell, the query text. */
  source: string;
  /**
   * A named output other cells can chain off (Hex-style): a downstream cell that
   * writes `FROM <outputName>` is resolved by inlining this cell as a CTE at
   * execution time (see `db/notebook-exec.ts`). Empty = not referenceable.
   */
  outputName?: string;
  /** Which data source to run against; omitted/undefined = the builtin warehouse. */
  datasourceId?: string;
}

export interface Notebook {
  id: string;
  title: string;
  cells: NotebookCell[];
  createdAt: number;
  updatedAt: number;
}

/** A row in the list view — no cell bodies, just a count. */
export interface NotebookSummary {
  id: string;
  title: string;
  cellCount: number;
  createdAt: number;
  updatedAt: number;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_notebooks (
           id          TEXT PRIMARY KEY,
           title       TEXT NOT NULL,
           cells       TEXT NOT NULL,
           created_at  INTEGER,
           updated_at  INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

/** A persisted cell, normalized — tolerant of older/partial JSON shapes. */
function normalizeCell(raw: unknown): NotebookCell | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const outputName = typeof c.outputName === 'string' ? c.outputName.trim() : '';
  return {
    id: typeof c.id === 'string' ? c.id : randomUUID(),
    kind: 'sql',
    source: typeof c.source === 'string' ? c.source : '',
    outputName: outputName || undefined,
    datasourceId: typeof c.datasourceId === 'string' ? c.datasourceId : undefined,
  };
}

function rowToNotebook(row: Record<string, Cell>): Notebook | null {
  try {
    const parsed = JSON.parse(String(row.cells)) as unknown;
    const cells = Array.isArray(parsed)
      ? parsed.map(normalizeCell).filter((c): c is NotebookCell => c !== null)
      : [];
    return {
      id: String(row.id),
      title: String(row.title),
      cells,
      createdAt: Number(row.created_at ?? 0),
      updatedAt: Number(row.updated_at ?? 0),
    };
  } catch {
    // Tolerate a corrupt row rather than crashing the whole list.
    return null;
  }
}

/** Validate + normalize an incoming cells payload (from the PUT/POST body). */
export function normalizeCells(raw: unknown): NotebookCell[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCell).filter((c): c is NotebookCell => c !== null);
}

export async function listNotebooks(): Promise<NotebookSummary[]> {
  await ensureSchema();
  const res = await dexStore.execute(
    'SELECT id, title, cells, created_at, updated_at FROM dex_notebooks ORDER BY updated_at DESC',
  );
  return (res.rows as unknown as Record<string, Cell>[])
    .map(rowToNotebook)
    .filter((n): n is Notebook => n !== null)
    .map((n) => ({
      id: n.id,
      title: n.title,
      cellCount: n.cells.length,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));
}

export async function getNotebook(id: string): Promise<Notebook | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_notebooks WHERE id = ?',
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return rowToNotebook(res.rows[0] as unknown as Record<string, Cell>);
}

export async function createNotebook(title: string, cells: NotebookCell[] = []): Promise<Notebook> {
  return createNotebookWithId(randomUUID(), title, cells);
}

/**
 * Create a notebook with a caller-chosen id. Used to bind a notebook to a thread
 * (`notebook id = threadId`) so the agent can author cells into "this thread's
 * notebook" (see the `create_sql_cell` tool). Fails if the id already exists.
 */
export async function createNotebookWithId(
  id: string,
  title: string,
  cells: NotebookCell[] = [],
): Promise<Notebook> {
  await ensureSchema();
  const now = Date.now();
  const notebook: Notebook = { id, title, cells, createdAt: now, updatedAt: now };
  await dexStore.execute({
    sql: `INSERT INTO dex_notebooks (id, title, cells, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, title, JSON.stringify(cells), now, now],
  });
  return notebook;
}

/**
 * Append a cell to a notebook, creating the notebook (with `titleIfNew`) if it
 * doesn't exist yet. `afterCellId` positions the new cell right after that cell;
 * otherwise it goes to the bottom. Returns the updated notebook. This is how the
 * agent grows a thread's notebook one cell at a time.
 */
export async function appendCell(
  notebookId: string,
  cell: NotebookCell,
  opts: { afterCellId?: string; titleIfNew?: string } = {},
): Promise<Notebook> {
  await ensureSchema();
  const existing = await getNotebook(notebookId);
  if (!existing) {
    return createNotebookWithId(notebookId, opts.titleIfNew?.trim() || 'Untitled notebook', [cell]);
  }
  const cells = [...existing.cells];
  const at = opts.afterCellId ? cells.findIndex((c) => c.id === opts.afterCellId) : -1;
  if (at >= 0) cells.splice(at + 1, 0, cell);
  else cells.push(cell);
  const updated = await updateNotebook(notebookId, { cells });
  return updated ?? { ...existing, cells, updatedAt: Date.now() };
}

/**
 * Update a notebook's title and/or cells. Pass only the fields that change;
 * `cells` replaces the whole array. The write is a single atomic `UPDATE`
 * (`COALESCE` keeps unspecified columns) — no read-then-write window — so
 * concurrent saves can't resurrect or interleave a stale snapshot. Returns the
 * updated notebook, or null if it doesn't exist.
 */
export async function updateNotebook(
  id: string,
  patch: { title?: string; cells?: NotebookCell[] },
): Promise<Notebook | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: `UPDATE dex_notebooks
             SET title = COALESCE(?, title),
                 cells = COALESCE(?, cells),
                 updated_at = ?
           WHERE id = ?`,
    args: [
      patch.title ?? null,
      patch.cells !== undefined ? JSON.stringify(patch.cells) : null,
      Date.now(),
      id,
    ],
  });
  if ((res.rowsAffected ?? 0) === 0) return null;
  return getNotebook(id);
}

/** Delete a notebook by id. Returns true if a row was removed. */
export async function deleteNotebook(id: string): Promise<boolean> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'DELETE FROM dex_notebooks WHERE id = ?',
    args: [id],
  });
  return (res.rowsAffected ?? 0) > 0;
}
