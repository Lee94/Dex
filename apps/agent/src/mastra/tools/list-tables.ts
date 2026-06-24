import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConnectorById } from '../db/connector';

export const listTablesTool = createTool({
  id: 'list_tables',
  description:
    'List every table in a data warehouse with its row count, plus the warehouse dialect. Call this FIRST to discover what data is available before answering a question. ' +
    "By default it targets the primary warehouse; when the question context names a specific data source by `datasourceId`, pass that id to list THAT source's tables instead.",
  inputSchema: z.object({
    datasourceId: z
      .string()
      .optional()
      .describe(
        'Optional data source id (from the question context) to target another registered source instead of the default warehouse.',
      ),
  }),
  outputSchema: z.object({
    dialect: z.string(),
    tables: z.array(
      z.object({
        name: z.string(),
        rowCount: z.number(),
      }),
    ),
  }),
  execute: async (input) => {
    const connector = await getConnectorById(input?.datasourceId ?? 'builtin');
    const tables = await connector.listTables();
    return { dialect: connector.dialect, tables };
  },
});
