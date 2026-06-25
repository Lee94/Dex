import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getThreadSummary, listThreadSummaries } from '../db/thread-summaries';

/**
 * `read_past_thread_summary` (Hex `ReadPastThreadSummary`) — recall context from
 * prior threads. With no argument it lists recent thread summaries (title +
 * gist); with a `threadId` it returns that thread's summary. Use it to avoid
 * re-deriving something a previous analysis already established.
 */
export const readPastThreadSummaryTool = createTool({
  id: 'read_past_thread_summary',
  description:
    'Recall what happened in earlier threads. Call with no argument to list recent thread summaries ' +
    '(title + gist), or with a threadId to read one in full. Use this when the user references prior ' +
    'work ("like last time", "the analysis from yesterday") so you can build on it instead of redoing it.',
  inputSchema: z.object({
    threadId: z.string().optional().describe('A thread id to read. Omit to list recent summaries.'),
  }),
  outputSchema: z.object({
    summaries: z
      .array(
        z.object({
          threadId: z.string(),
          title: z.string(),
          summary: z.string(),
        }),
      )
      .optional(),
    summary: z.object({ threadId: z.string(), title: z.string(), summary: z.string() }).optional(),
    found: z.boolean().optional(),
  }),
  execute: async (input) => {
    if (!input?.threadId) {
      const summaries = await listThreadSummaries();
      return {
        summaries: summaries.map((s) => ({
          threadId: s.threadId,
          title: s.title,
          summary: s.summary,
        })),
      };
    }
    const s = await getThreadSummary(input.threadId);
    if (!s) return { found: false };
    return { found: true, summary: { threadId: s.threadId, title: s.title, summary: s.summary } };
  },
});
