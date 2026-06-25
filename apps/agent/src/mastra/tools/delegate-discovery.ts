import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { dataDiscoveryAgent } from '../agents/discovery';

/**
 * `delegate_to_data_discovery` (Hex `DelegateToDataDiscoveryAgent`) — hand a
 * discovery task to the data-discovery specialist and get back a compact brief of
 * the relevant sources/tables/columns/metrics + join paths. Use it on a complex
 * or cross-source ask to keep your own context focused; you stay responsible for
 * the final query and the synthesized answer.
 */
export const delegateDiscoveryTool = createTool({
  id: 'delegate_to_data_discovery',
  description:
    'Delegate data discovery to a specialist sub-agent: describe what you need to find (an entity, ' +
    'a metric, a cross-source question) and get back a concise brief — the relevant sources, tables, ' +
    'columns or semantic metrics, their grain, and how to join them. Use this for complex or ' +
    'multi-source questions before writing SQL; then build the analysis yourself from the brief.',
  inputSchema: z.object({
    task: z
      .string()
      .describe('What to discover — the entity/metric/question and any constraints to scope it.'),
  }),
  outputSchema: z.object({
    brief: z.string(),
  }),
  execute: async (input) => {
    const out = await dataDiscoveryAgent.generate(input.task);
    return { brief: out.text };
  },
});
