import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getBuiltinDataSource } from '../db/connector';
import { loadAllConfigs, toPublicDataSource } from '../db/datasources';

/**
 * `ListDataConnections` (Hex) — enumerate the registered data connections the
 * agent can query. The env-driven primary warehouse is surfaced as the `builtin`
 * connection; user-registered connections are listed alongside it. The agent
 * targets any of them by passing its `id` as `dataConnectionId` to
 * FindTableSchemas / ViewTables / RunSQL — no composer attachment required.
 */
export const listDatasourcesTool = createTool({
  id: 'ListDataConnections',
  description:
    'List all available data connections (databases) in the workspace: the primary warehouse (id ' +
    '"builtin") plus any registered connections, each with its id, dialect, and a human label. Use ' +
    'this when you need to query data but have no connection reference yet, when the user names a ' +
    'connection you must resolve, or when your current connection lacks the tables you need. To ' +
    'inspect or query a non-primary connection, pass its `id` as `dataConnectionId` to ' +
    'FindTableSchemas / ViewTables / RunSQL. Do NOT call this if you already hold a valid connection ' +
    'reference from a prior tool call or from context.',
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
