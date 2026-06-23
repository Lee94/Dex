import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { describeTable } from '../db/queries';

export const describeTableTool = createTool({
  id: 'describe_table',
  description:
    "Inspect a table's columns (name, type, nullability, primary key) plus a few sample rows. Use this to understand a table's shape before writing SQL against it.",
  inputSchema: z.object({
    table: z.string().describe('Exact table name, as returned by list_tables'),
  }),
  outputSchema: z.object({
    table: z.string(),
    columns: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        notnull: z.boolean(),
        primaryKey: z.boolean(),
      }),
    ),
    sampleRows: z.array(z.record(z.string(), z.any())),
  }),
  execute: async (input) => {
    return await describeTable(input.table);
  },
});
