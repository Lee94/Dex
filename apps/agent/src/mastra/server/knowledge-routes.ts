import { registerApiRoute } from '@mastra/core/server';
import { createGuide, deleteGuide, getGuide, listGuides, updateGuide } from '../db/guides';
import { deleteMemory, listMemories, saveMemory } from '../db/memories';
import { deleteReviewRequest, listReviewRequests } from '../db/reviews';
import { fail } from './http';

/**
 * Knowledge & memory HTTP API (v0.9).
 *
 * Backs the web "Knowledge" surface: author/edit/delete org **guides** the agent
 * reads, review/forget durable **memories**, and list/clear data-team **review
 * requests**. Served off Mastra's server root alongside the v0.6 data-source
 * routes; independent of the agent stream.
 */
export const knowledgeRoutes = [
  // --- guides ---------------------------------------------------------------
  registerApiRoute('/guides', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json({ guides: await listGuides() }),
  }),

  registerApiRoute('/guides', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        title?: string;
        content?: string;
        tags?: string[];
      };
      if (!body.title?.trim()) return c.json(fail('A guide title is required'), 400);
      try {
        const guide = await createGuide({
          title: body.title,
          content: body.content ?? '',
          tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        });
        return c.json({ guide }, 201);
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),

  registerApiRoute('/guides/:id', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const guide = await getGuide(c.req.param('id'));
      if (!guide) return c.json(fail('Guide not found', 404), 404);
      return c.json({ guide });
    },
  }),

  registerApiRoute('/guides/:id', {
    method: 'PATCH',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        title?: string;
        content?: string;
        tags?: string[];
      };
      const guide = await updateGuide(c.req.param('id'), {
        title: body.title,
        content: body.content,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      });
      if (!guide) return c.json(fail('Guide not found', 404), 404);
      return c.json({ guide });
    },
  }),

  registerApiRoute('/guides/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteGuide(c.req.param('id'));
      if (!removed) return c.json(fail('Guide not found', 404), 404);
      return c.json({ ok: true });
    },
  }),

  // --- memories -------------------------------------------------------------
  registerApiRoute('/memories', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json({ memories: await listMemories() }),
  }),

  registerApiRoute('/memories', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { content?: string };
      if (!body.content?.trim()) return c.json(fail('content is required'), 400);
      try {
        const memory = await saveMemory(body.content);
        return c.json({ memory }, 201);
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),

  registerApiRoute('/memories/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteMemory(c.req.param('id'));
      if (!removed) return c.json(fail('Memory not found', 404), 404);
      return c.json({ ok: true });
    },
  }),

  // --- review requests ------------------------------------------------------
  registerApiRoute('/reviews', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json({ reviews: await listReviewRequests() }),
  }),

  registerApiRoute('/reviews/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteReviewRequest(c.req.param('id'));
      if (!removed) return c.json(fail('Review request not found', 404), 404);
      return c.json({ ok: true });
    },
  }),
];
