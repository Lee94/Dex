import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { saveMemory } from '../db/memories';

/**
 * `save_memory` (Hex `SaveMemory`) — persist a confirmed user preference across
 * threads. Saves are explicit only: call this when the user states a durable
 * convention ("always report revenue in thousands", "our fiscal year starts in
 * February", "default to completed orders") — never to record one-off facts or
 * to extract preferences silently. Saved memories are folded into the agent's
 * context on every future turn, including new threads.
 */
export const saveMemoryTool = createTool({
  id: 'save_memory',
  description:
    'Save a durable user preference or convention so you honor it in every future thread (e.g. ' +
    '"report revenue in thousands", "fiscal year starts in February", "default to completed orders"). ' +
    'Only save preferences the user has actually stated or confirmed — never guess, and never save ' +
    'one-off question details. State plainly that you will remember it.',
  inputSchema: z.object({
    content: z
      .string()
      .describe('The preference to remember, phrased as a standalone, durable statement.'),
  }),
  outputSchema: z.object({
    saved: z.boolean(),
    content: z.string(),
  }),
  execute: async (input) => {
    const memory = await saveMemory(input.content);
    return { saved: true, content: memory.content };
  },
});
