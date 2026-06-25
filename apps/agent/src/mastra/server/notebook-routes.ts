import { registerApiRoute } from '@mastra/core/server';
import { getConnectorById } from '../db/connector';
import {
  createNotebook,
  createNotebookWithId,
  deleteNotebook,
  getNotebook,
  listNotebooks,
  normalizeCells,
  updateNotebook,
} from '../db/notebooks';
import { resolveChainedSql } from '../db/notebook-exec';
import { fail } from './http';

/**
 * Notebook module HTTP API (v2.0 — NotebookEditor).
 *
 * CRUD for cell-based notebooks plus a deterministic read-only execution
 * endpoint that runs one cell within its notebook (resolving Hex-style
 * `outputName` chaining via `resolveChainedSql`). Like the data-source routes
 * (`server/routes.ts`) these mount at the server root (NOT under `/api`) and are
 * independent of the agent — running a cell never involves the LLM.
 *
 * Every execution goes through `getConnectorById(id).runReadOnlySql(...)`, so the
 * read-only guard (`assertReadOnly`) + Postgres defenses apply to cells too.
 */

const DEFAULT_TITLE = 'Untitled notebook';

export const notebookRoutes = [
  // --- list / create --------------------------------------------------------
  registerApiRoute('/notebooks', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const notebooks = await listNotebooks();
      return c.json({ notebooks });
    },
  }),

  registerApiRoute('/notebooks', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { title?: string; cells?: unknown };
      const title = body.title?.trim() || DEFAULT_TITLE;
      const cells = normalizeCells(body.cells);
      const notebook = await createNotebook(title, cells);
      return c.json({ notebook }, 201);
    },
  }),

  // --- read / update / delete ----------------------------------------------
  registerApiRoute('/notebooks/:id', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const notebook = await getNotebook(c.req.param('id'));
      if (!notebook) return c.json(fail('Notebook not found', 404), 404);
      return c.json({ notebook });
    },
  }),

  // PUT is an upsert: it updates an existing notebook, or creates one with this
  // exact id if missing. The latter lets the web bind a notebook to a thread
  // (`notebook id = threadId`) when opening a thread "as a notebook".
  registerApiRoute('/notebooks/:id', {
    method: 'PUT',
    requiresAuth: false,
    handler: async (c) => {
      const id = c.req.param('id');
      const body = (await c.req.json().catch(() => ({}))) as { title?: string; cells?: unknown };
      const patch: { title?: string; cells?: ReturnType<typeof normalizeCells> } = {};
      if (typeof body.title === 'string') patch.title = body.title.trim() || DEFAULT_TITLE;
      if (body.cells !== undefined) patch.cells = normalizeCells(body.cells);
      const notebook =
        (await updateNotebook(id, patch)) ??
        (await createNotebookWithId(id, patch.title ?? DEFAULT_TITLE, patch.cells ?? []));
      return c.json({ notebook });
    },
  }),

  registerApiRoute('/notebooks/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteNotebook(c.req.param('id'));
      if (!removed) return c.json(fail('Notebook not found', 404), 404);
      return c.json({ ok: true });
    },
  }),

  // --- run one cell within its notebook (resolving outputName chaining) ------
  registerApiRoute('/query/run', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        cells?: unknown;
        targetCellId?: string;
        datasourceId?: string;
      };
      const cells = normalizeCells(body.cells);
      const targetCellId = typeof body.targetCellId === 'string' ? body.targetCellId : '';
      if (!targetCellId) return c.json(fail('targetCellId is required'), 400);
      const target = cells.find((cell) => cell.id === targetCellId);
      if (!target) return c.json(fail('targetCellId is not in the provided cells'), 400);
      const datasourceId = body.datasourceId?.trim() || target.datasourceId || 'builtin';
      try {
        // resolveChainedSql flattens upstream cells into CTEs; runReadOnlySql
        // re-runs assertReadOnly (single statement, SELECT/WITH only).
        const sql = resolveChainedSql(cells, targetCellId);
        const connector = await getConnectorById(datasourceId);
        const result = await connector.runReadOnlySql(sql);
        return c.json(result);
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),
];
