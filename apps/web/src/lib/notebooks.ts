import { apiFetch } from '@/lib/apiClient';

/**
 * Notebook module client (v2.0 — NotebookEditor).
 *
 * Talks to the notebook CRUD + cell-execution routes the agent exposes (see
 * apps/agent/src/mastra/server/notebook-routes.ts), mounted at the server root
 * (NOT under `/api`). Mirrors `lib/dataSources.ts`: stateless helpers over the
 * shared `apiFetch` (lib/apiClient.ts); loading/caching belongs to the hook.
 */

/** The title a new (untitled) notebook gets — kept here so the hook agrees. */
export const DEFAULT_NOTEBOOK_TITLE = 'Untitled notebook';

/** localStorage key for the last-open notebook — shared by the hook (restore on
 *  reload) and App (open a thread "as a notebook"). */
export const ACTIVE_NOTEBOOK_KEY = 'dex.activeNotebookId';

// --- types (mirror the backend route payloads) ------------------------------

export type CellKind = 'sql';

export interface NotebookCell {
  id: string;
  kind: CellKind;
  /** The cell's source — for a SQL cell, the query text. */
  source: string;
  /** A named output downstream cells can chain off via `FROM <outputName>`. */
  outputName?: string;
  /** Run against another registered source; omitted = the builtin warehouse. */
  datasourceId?: string;
}

export interface Notebook {
  id: string;
  title: string;
  cells: NotebookCell[];
  createdAt: number;
  updatedAt: number;
}

export interface NotebookSummary {
  id: string;
  title: string;
  cellCount: number;
  createdAt: number;
  updatedAt: number;
}

/** The shape `/query/run` returns on success — same as `run_sql`'s result. */
export interface SqlRunResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

// --- fetch functions --------------------------------------------------------

export function listNotebooks(): Promise<NotebookSummary[]> {
  return apiFetch<{ notebooks: NotebookSummary[] }>('/notebooks').then((r) => r.notebooks);
}

export function getNotebook(id: string): Promise<Notebook> {
  return apiFetch<{ notebook: Notebook }>(`/notebooks/${encodeURIComponent(id)}`).then(
    (r) => r.notebook,
  );
}

export function createNotebook(input?: {
  title?: string;
  cells?: NotebookCell[];
}): Promise<Notebook> {
  return apiFetch<{ notebook: Notebook }>('/notebooks', {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  }).then((r) => r.notebook);
}

export function updateNotebook(
  id: string,
  patch: { title?: string; cells?: NotebookCell[] },
): Promise<Notebook> {
  return apiFetch<{ notebook: Notebook }>(`/notebooks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  }).then((r) => r.notebook);
}

export function deleteNotebook(id: string): Promise<void> {
  return apiFetch<{ ok: boolean }>(`/notebooks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).then(() => undefined);
}

/** Get a notebook, creating an empty one with this id if it doesn't exist (used
 *  to open a thread "as a notebook", where `notebook id = threadId`). */
export async function ensureNotebook(id: string, title?: string): Promise<Notebook> {
  try {
    return await getNotebook(id);
  } catch {
    // Missing (or unreachable) — PUT upserts a fresh notebook with this id.
    return updateNotebook(id, { title: title ?? DEFAULT_NOTEBOOK_TITLE, cells: [] });
  }
}

/** Run one cell within its notebook, resolving Hex-style `outputName` chaining
 *  (the backend flattens upstream cells into CTEs). Throws with the guard's /
 *  resolver's message on a rejected or failing query. */
export function runCell(
  cells: NotebookCell[],
  targetCellId: string,
  datasourceId?: string,
): Promise<SqlRunResult> {
  return apiFetch<SqlRunResult>('/query/run', {
    method: 'POST',
    body: JSON.stringify({ cells, targetCellId, datasourceId }),
  });
}

// --- pure display helpers ---------------------------------------------------

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/** A fresh, empty SQL cell. */
export function newSqlCell(source = ''): NotebookCell {
  return { id: uid(), kind: 'sql', source };
}

/** Project a full notebook to its list-row summary (for optimistic updates). */
export function summaryOf(nb: Notebook): NotebookSummary {
  return {
    id: nb.id,
    title: nb.title,
    cellCount: nb.cells.length,
    createdAt: nb.createdAt,
    updatedAt: nb.updatedAt,
  };
}

/** "just now" / "2 hrs ago" / a date — the relative label the list shows. */
export function relativeTime(at: number): string {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString();
}
