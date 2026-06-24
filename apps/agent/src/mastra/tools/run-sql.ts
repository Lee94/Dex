import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { dialectHint, getActiveProvider, getConnectorById } from '../db/connector';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

export const runSqlTool = createTool({
  id: 'run_sql',
  description:
    `Run a single read-only SQL query (SELECT, or WITH ... SELECT) and get back columns + rows. ` +
    `By default it runs against the primary ${DIALECT} warehouse; when the question context names a specific data source by \`datasourceId\`, pass that id to run against THAT source (write SQL for the dialect reported by list_tables / describe_table for it). ` +
    'Write/DDL statements (INSERT/UPDATE/DELETE/DROP/...) are rejected. ' +
    `Inspect the relevant tables with describe_table before querying. For the default warehouse: ${dialectHint()}`,
  inputSchema: z.object({
    sql: z
      .string()
      .describe('A single read-only query. No multiple semicolon-separated statements.'),
    datasourceId: z
      .string()
      .optional()
      .describe(
        'Optional data source id to run against another registered source instead of the default warehouse.',
      ),
  }),
  outputSchema: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.any())),
    rowCount: z.number(),
    truncated: z.boolean(),
  }),
  execute: async (input) => {
    const connector = await getConnectorById(input.datasourceId ?? 'builtin');
    return await connector.runReadOnlySql(input.sql);
  },
});
