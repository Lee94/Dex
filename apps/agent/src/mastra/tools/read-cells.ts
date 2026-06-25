import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getNotebook } from '../db/notebooks';

/**
 * Hex's `CellSearch` analogue, scoped to THIS thread's notebook. Lets the agent
 * see the cells it has already created — their ids, output names, and SQL — so it
 * can build on them: reuse an outputName, chain a new cell off one (`FROM
 * <outputName>`), or position a new cell after a given one.
 */
export const readCellsTool = createTool({
  id: 'read_cells',
  description:
    "List the SQL cells already in this thread's shared notebook (cellId, outputName, source). " +
    'Call this before create_sql_cell so you can chain off an existing cell by its outputName, ' +
    'reference a cellId in your answer with [cell:<cellId>], or position a new cell. Empty when no cells exist yet.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    cells: z.array(
      z.object({
        cellId: z.string(),
        outputName: z.string().nullable(),
        source: z.string(),
      }),
    ),
  }),
  execute: async (_input, ctx) => {
    const threadId = ctx?.agent?.threadId;
    if (!threadId) return { cells: [] };
    const notebook = await getNotebook(threadId);
    return {
      cells: (notebook?.cells ?? []).map((c) => ({
        cellId: c.id,
        outputName: c.outputName ?? null,
        source: c.source,
      })),
    };
  },
});
