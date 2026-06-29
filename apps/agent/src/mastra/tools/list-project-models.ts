import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listProjectCubes } from '../db/semantic';

/**
 * `ListProjectModels` — the semantic-model assistant's join-target catalog. Given
 * the bound `projectId`, it lists the OTHER models in that project (built-in cubes
 * for the `dex` project + the project's user models) with their base table and
 * members. The assistant reads this to pick a join `to:` and learn the target's
 * base table, then confirms the actual join-key columns with FindTableSchemas
 * before writing the `joins:` block. Read-only; lists no other project.
 */
export const listProjectModelsTool = createTool({
  id: 'ListProjectModels',
  description:
    'List the existing semantic models (cubes) in THIS project — the only valid targets for a join. ' +
    'Returns each model name, its base table, and its dimensions/measures. Use this before writing a ' +
    "`joins:` block: pick a target by name, then call FindTableSchemas on the target's base table to " +
    'confirm the real join-key columns. Pass the projectId from the instructions.',
  inputSchema: z.object({
    projectId: z
      .string()
      .nullable()
      .optional()
      .describe(
        'The semantic project to list models from (from the instructions; defaults to dex).',
      ),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    models: z.array(
      z.object({
        name: z.string(),
        baseTable: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        endorsed: z.boolean(),
        dimensions: z.array(z.object({ name: z.string(), sql: z.string() })),
        measures: z.array(z.object({ name: z.string(), type: z.string() })),
      }),
    ),
  }),
  execute: async (input) => {
    const projectId = input.projectId?.trim() || 'dex';
    return { projectId, models: await listProjectCubes(projectId) };
  },
});
