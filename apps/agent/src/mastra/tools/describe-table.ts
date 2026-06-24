import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConnectorById } from '../db/connector';

export const describeTableTool = createTool({
  id: 'describe_table',
  description:
    "Inspect a table's columns (name, type, nullability, primary key) plus a few sample rows. Use this to understand a table's shape before writing SQL against it. " +
    'Pass the same `datasourceId` you used with list_tables to inspect a table in another registered data source.',
  inputSchema: z.object({
    table: z.string().describe('Exact table name, as returned by list_tables'),
    datasourceId: z
      .string()
      .optional()
      .describe(
        'Optional data source id to target another registered source instead of the default warehouse.',
      ),
  }),
  outputSchema: z.object({
    table: z.string(),
    dialect: z.string(),
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
    const connector = await getConnectorById(input.datasourceId ?? 'builtin');
    const desc = await connector.describeTable(input.table);
    return { ...desc, dialect: connector.dialect };
  },
});
