import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getBuiltinDataSource } from '../db/connector';
import { loadAllConfigs, toPublicDataSource } from '../db/datasources';

/**
 * `list_datasources` (Hex `ListDataConnections`) — enumerate the registered data
 * sources the agent can query. The env-driven primary warehouse is surfaced as
 * the `builtin` source; user-registered connections are listed alongside it. The
 * agent targets any of them by passing its `id` as `datasourceId` to
 * list_tables / describe_table / run_sql — no composer attachment required.
 */
export const listDatasourcesTool = createTool({
  id: 'list_datasources',
  description:
    'List the data sources (databases) you can query: the primary warehouse (id "builtin") plus ' +
    'any registered connections, each with its id, dialect, and a human label. To inspect or query ' +
    'a non-primary source, pass its `id` as `datasourceId` to list_tables / describe_table / run_sql. ' +
    'Use this when a question might live in another connected database, not just the primary warehouse.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    datasources: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        dialect: z.string(),
        target: z.string(),
        isBuiltin: z.boolean(),
        isPrimary: z.boolean().describe('True for the warehouse tools target by default.'),
      }),
    ),
  }),
  execute: async () => {
    const builtin = getBuiltinDataSource();
    const configs = await loadAllConfigs();
    const sources = [builtin, ...configs.map(toPublicDataSource)];
    return {
      datasources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        dialect: s.dialect,
        target: s.target,
        isBuiltin: s.isBuiltin,
        isPrimary: s.isAgentSource,
      })),
    };
  },
});
