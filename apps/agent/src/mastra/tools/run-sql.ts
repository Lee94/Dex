import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runReadOnlySql } from '../db/queries';

export const runSqlTool = createTool({
  id: 'run_sql',
  description:
    'Run a single read-only SQL query (SELECT, or WITH ... SELECT) against the SQLite warehouse and get back columns + rows. ' +
    'Write/DDL statements (INSERT/UPDATE/DELETE/DROP/...) are rejected. ' +
    'Inspect the relevant tables with describe_table before querying. This is SQLite, so use SQLite date functions (e.g. strftime, date()).',
  inputSchema: z.object({
    sql: z.string().describe('A single read-only SQLite query. No multiple semicolon-separated statements.'),
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
