import { registerApiRoute } from '@mastra/core/server';
import {
  createPin,
  deletePin,
  listPins,
  reorderPins,
  type NewPinInput,
  type PinKind,
} from '../db/reports';
import { fail } from './http';

/**
 * Pins & reports HTTP API (v3.4).
 *
 * Backs the web report surface: pin a result/chart out of a thread, list/reorder
 * a thread's pins, and render them read-only (the Share link). A "report" is just
 * the ordered set of a thread's pins — there is no separate report entity.
 * Independent of the agent stream, like the other root route modules.
 */
export const reportRoutes = [
  registerApiRoute('/reports/:threadId/pins', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json({ pins: await listPins(c.req.param('threadId')) }),
  }),

  registerApiRoute('/reports/:threadId/pins', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const threadId = c.req.param('threadId');
      const body = (await c.req.json().catch(() => ({}))) as Partial<NewPinInput>;
      const kind: PinKind = body.kind === 'chart' ? 'chart' : 'table';
      if (!body.payload || typeof body.payload !== 'object') {
        return c.json(fail('payload is required'), 400);
      }
      const pin = await createPin({
        threadId,
        kind,
        title: typeof body.title === 'string' ? body.title : undefined,
        payload: body.payload as Record<string, unknown>,
      });
      return c.json({ pin }, 201);
    },
  }),

  registerApiRoute('/reports/:threadId/pins/reorder', {
    method: 'PATCH',
    requiresAuth: false,
    handler: async (c) => {
      const threadId = c.req.param('threadId');
      const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
      const ids = Array.isArray(body.ids)
        ? body.ids.filter((x): x is string => typeof x === 'string')
        : [];
      const pins = await reorderPins(threadId, ids);
      return c.json({ pins });
    },
  }),

  registerApiRoute('/reports/:threadId/pins/:pinId', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deletePin(c.req.param('pinId'));
      if (!removed) return c.json(fail('Pin not found', 404), 404);
      return c.json({ ok: true });
    },
  }),
];
