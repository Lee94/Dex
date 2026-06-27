import { registerApiRoute } from '@mastra/core/server';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
  type NewProjectInput,
  type ProjectPatch,
} from '../db/projects';
import { fail } from './http';

/**
 * Projects HTTP API (v3.0).
 *
 * Backs the web Projects surface (list / create / edit name+description+
 * instructions+bound data sources / delete). A project is a container that groups
 * threads and carries shared context; thread membership lives in Mastra thread
 * metadata (not here), so there are no thread endpoints in this module. Independent
 * of the agent stream, like the other root route modules.
 */
export const projectRoutes = [
  registerApiRoute('/projects', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json({ projects: await listProjects() }),
  }),

  registerApiRoute('/projects', {
    method: 'POST',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Partial<NewProjectInput>;
      if (!body.name?.trim()) return c.json(fail('name is required'), 400);
      const project = await createProject({
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
      });
      return c.json({ project }, 201);
    },
  }),

  registerApiRoute('/projects/:id', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const project = await getProject(c.req.param('id'));
      if (!project) return c.json(fail('Project not found', 404), 404);
      return c.json({ project });
    },
  }),

  registerApiRoute('/projects/:id', {
    method: 'PATCH',
    requiresAuth: false,
    handler: async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Partial<ProjectPatch>;
      const patch: ProjectPatch = {
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
      };
      const project = await updateProject(c.req.param('id'), patch);
      if (!project) return c.json(fail('Project not found', 404), 404);
      return c.json({ project });
    },
  }),

  registerApiRoute('/projects/:id', {
    method: 'DELETE',
    requiresAuth: false,
    handler: async (c) => {
      const removed = await deleteProject(c.req.param('id'));
      if (!removed) return c.json(fail('Project not found', 404), 404);
      return c.json({ ok: true });
    },
  }),
];
