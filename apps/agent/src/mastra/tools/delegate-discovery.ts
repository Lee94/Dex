import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { dataDiscoveryAgent } from '../agents/discovery';

/**
 * `DelegateToDataDiscoveryAgent` (Hex) — hand a discovery task to the
 * data-discovery specialist and get back a compact brief of the relevant
 * sources/tables/columns/metrics + join paths. Delegate when you need to discover
 * or understand WHICH data to use (not a needle query where you already know the
 * target). Use ViewTables directly when you already know the exact table; use
 * FindTableSchemas for keyword discovery you can do yourself in 1-2 tries.
 */
export const delegateDiscoveryTool = createTool({
  id: 'DelegateToDataDiscoveryAgent',
  description:
    'Delegate data discovery to a specialized exploration sub-agent. Delegate when you need to ' +
    'discover or understand which data to use — an entity, a metric, a cross-source question — and ' +
    'get back a concise brief: the relevant connections, tables, columns or semantic metrics, their ' +
    'grain, and how to join them. Use ViewTables directly when you already know the specific table ' +
    'name; use FindTableSchemas for keyword discovery you can do yourself. Fallback: if ' +
    "FindTableSchemas doesn't find relevant tables in 1-2 tries, delegate here rather than continuing " +
    'to search. Build the analysis yourself from the returned brief.',
  inputSchema: z.object({
    task: z
      .string()
      .describe(
        'The data search/discovery task to delegate — be specific and detailed about what data you need to discover.',
      ),
    dataConnectionId: z
      .string()
      .nullable()
      .optional()
      .describe('Optional data connection id to scope discovery to a specific connection.'),
  }),
  outputSchema: z.object({
    brief: z.string(),
  }),
  execute: async (input) => {
    const task = input.dataConnectionId
      ? `${input.task}\n\n(Scope discovery to data connection id "${input.dataConnectionId}".)`
      : input.task;
    const out = await dataDiscoveryAgent.generate(task);
    return { brief: out.text };
  },
});
