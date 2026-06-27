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
  id: 'SaveMemory',
  description:
    "Save an explicit memory about the user's preferences, patterns, or context for future " +
    'conversations (e.g. "report revenue in thousands", "fiscal year starts in February", "default ' +
    'to completed orders"). Use it when the user explicitly asks you to remember something, or when ' +
    'you discover a strong, stable preference the user confirms. Do NOT save proactively, do NOT save ' +
    'ephemeral one-off details, and do NOT save info already in the user profile. Keep each memory ' +
    'concise and specific — one clear statement. State plainly that you will remember it.',
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
