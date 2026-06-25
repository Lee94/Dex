import { registerApiRoute } from '@mastra/core/server';
import { assertReadOnly } from '../db/guard';
import { isValidCron } from '../db/cron';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
  type NewTaskInput,
} from '../db/tasks';
import { runTask } from '../db/task-runner';
import {
  deleteThreadSummary,
  getThreadSummary,
  listThreadSummaries,
  upsertThreadSummary,
} from '../db/thread-summaries';
import { fail } from './http';

/**
 * Scheduling & recall HTTP API (v1.3).
 *
 * Backs the web Tasks surface (list / create / enable-disable / delete / run-now)
 * and the past-thread-summary recall the agent reads. Task creation/edits
 * validate the cron + the read-only SQL guard before persisting; "run now"
 * executes through the same read-only path the scheduler uses.
 */
export const taskRoutes = [
  // --- tasks ----------------------------------------------------------------
  registerApiRoute('/tasks', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json({ tasks: await listTasks() }),
  }),

  registerApiRoute('/tasks', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Partial<NewTaskInput>;
      if (!body.name?.trim()) return c.json(fail('name is required'), 400);
      if (!body.cron || !isValidCron(body.cron))
        return c.json(fail('a valid 5-field cron is required'), 400);
      const kind = body.kind === 'notebook' ? 'notebook' : 'sql';
      if (kind === 'sql') {
        if (!body.sql?.trim()) return c.json(fail('sql is required for a sql task'), 400);
        try {
          assertReadOnly(body.sql);
        } catch (err) {
          return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
        }
      } else if (!body.notebookId?.trim()) {
        return c.json(fail('notebookId is required for a notebook task'), 400);
      }
      const task = await createTask({
        name: body.name,
        kind,
        sql: body.sql,
        notebookId: body.notebookId,
        cellId: body.cellId,
        cron: body.cron,
        enabled: body.enabled ?? true,
        delivery: body.delivery ?? { channel: 'none' },
        alert: body.alert ?? null,
      });
      return c.json({ task }, 201);
    },
  }),

  registerApiRoute('/tasks/:id', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const task = await getTask(c.req.param('id'));
      if (!task) return c.json(fail('Task not found', 404), 404);
      return c.json({ task });
    },
  }),

  registerApiRoute('/tasks/:id', {
    method: 'PATCH',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Partial<NewTaskInput>;
      if (body.cron != null && !isValidCron(body.cron)) {
        return c.json(fail('invalid cron expression'), 400);
      }
      if (body.sql != null) {
        try {
          assertReadOnly(body.sql);
        } catch (err) {
          return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
        }
      }
      const task = await updateTask(c.req.param('id'), {
        name: body.name,
        cron: body.cron,
        enabled: body.enabled,
        delivery: body.delivery,
        alert: body.alert ?? undefined,
        sql: body.sql,
      });
      if (!task) return c.json(fail('Task not found', 404), 404);
      return c.json({ task });
    },
  }),

  registerApiRoute('/tasks/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteTask(c.req.param('id'));
      if (!removed) return c.json(fail('Task not found', 404), 404);
      return c.json({ ok: true });
    },
  }),

  // Run a task immediately (manual trigger) — through the read-only path.
  registerApiRoute('/tasks/:id/run', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const task = await getTask(c.req.param('id'));
      if (!task) return c.json(fail('Task not found', 404), 404);
      const run = await runTask(task);
      return c.json({ run });
    },
  }),

  // --- past-thread summaries ------------------------------------------------
  registerApiRoute('/thread-summaries', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json({ summaries: await listThreadSummaries() }),
  }),

  registerApiRoute('/thread-summaries/:threadId', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const summary = await getThreadSummary(c.req.param('threadId'));
      if (!summary) return c.json(fail('Summary not found', 404), 404);
      return c.json({ summary });
    },
  }),

  registerApiRoute('/thread-summaries/:threadId', {
    method: 'PUT',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { title?: string; summary?: string };
      if (!body.title?.trim() || !body.summary?.trim()) {
        return c.json(fail('title and summary are required'), 400);
      }
      const summary = await upsertThreadSummary(c.req.param('threadId'), {
        title: body.title,
        summary: body.summary,
      });
      return c.json({ summary });
    },
  }),

  registerApiRoute('/thread-summaries/:threadId', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteThreadSummary(c.req.param('threadId'));
      if (!removed) return c.json(fail('Summary not found', 404), 404);
      return c.json({ ok: true });
    },
  }),
];
