import { registerApiRoute } from '@mastra/core/server';
import { deleteUpload, listUploads, readFileContents, saveUpload } from '../db/uploads';
import { fail } from './http';

/**
 * Uploads HTTP API (v1.1).
 *
 * Backs the composer's file-attach affordance: store a small file (JSON base64),
 * list uploads, read one's parsed contents, delete one. The agent reads uploads
 * by id via `get_file_contents`. Mounted at the server root alongside the other
 * route modules.
 */
export const uploadRoutes = [
  registerApiRoute('/uploads', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json({ uploads: await listUploads() }),
  }),

  registerApiRoute('/uploads', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        filename?: string;
        mimetype?: string;
        contentBase64?: string;
      };
      if (!body.filename?.trim()) return c.json(fail('filename is required'), 400);
      if (!body.contentBase64) return c.json(fail('contentBase64 is required'), 400);
      try {
        const meta = await saveUpload({
          filename: body.filename,
          mimetype: body.mimetype ?? 'application/octet-stream',
          contentBase64: body.contentBase64,
        });
        return c.json({ upload: meta }, 201);
      } catch (err) {
        return c.json(fail(err instanceof Error ? err.message : String(err)), 400);
      }
    },
  }),

  registerApiRoute('/uploads/:id', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const file = await readFileContents(c.req.param('id'));
      if (!file) return c.json(fail('Upload not found', 404), 404);
      return c.json({ file });
    },
  }),

  registerApiRoute('/uploads/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteUpload(c.req.param('id'));
      if (!removed) return c.json(fail('Upload not found', 404), 404);
      return c.json({ ok: true });
    },
  }),
];
