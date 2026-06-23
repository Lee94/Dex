import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listTables } from '../db/queries';

export const listTablesTool = createTool({
  id: 'list_tables',
  description:
    'List every table in the data warehouse with its row count. Call this FIRST to discover what data is available before answering a question.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    tables: z.array(
      z.object({
        name: z.string(),
        rowCount: z.number(),
      }),
    ),
  }),
  execute: async () => {
    const tables = await listTables();
    return { tables };
  },
});
