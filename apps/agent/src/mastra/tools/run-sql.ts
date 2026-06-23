import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { dialectHint, getActiveProvider, runReadOnlySql } from '../db/queries';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

export const runSqlTool = createTool({
  id: 'run_sql',
  description:
    `Run a single read-only SQL query (SELECT, or WITH ... SELECT) against the ${DIALECT} warehouse and get back columns + rows. ` +
    'Write/DDL statements (INSERT/UPDATE/DELETE/DROP/...) are rejected. ' +
    `Inspect the relevant tables with describe_table before querying. ${dialectHint()}`,
  inputSchema: z.object({
    sql: z
      .string()
      .describe(`A single read-only ${DIALECT} query. No multiple semicolon-separated statements.`),
  }),
  outputSchema: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.any())),
    rowCount: z.number(),
    truncated: z.boolean(),
  }),
  execute: async (input) => {
    return await runReadOnlySql(input.sql);
  },
});
