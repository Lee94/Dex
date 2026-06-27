import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { dialectHint, getActiveProvider, getConnectorById } from '../db/connector';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

/**
 * `ShowSql`. Unlike `RunSQL` (an ephemeral scratchpad whose result only you see),
 * this runs a read-only query and **shows its result to the user** as a table.
 * It returns the columns + rows and a result `id`; reference that result in your
 * answer by putting `[result:<id>]` on its own line where the table should appear.
 * Give a result an `outputName` (snake_case) so a chart (build_chart) can bind to
 * its rows. Results are ephemeral to the conversation — there is no notebook and
 * no cross-query chaining, so write self-contained SQL (use CTEs to compose).
 */
export const showSqlTool = createTool({
  id: 'ShowSql',
  description:
    `Run a read-only SQL query and SHOW its result (a table) to the user. Use this — NOT RunSQL — for ` +
    `any query result the user should see, then put [result:<id>] on its own line in your answer where ` +
    `the table should appear. Give a result an \`outputName\` (snake_case) so a chart can bind to it. ` +
    `Write self-contained SQL (compose with CTEs); there is no cross-query chaining. ONLY read-only ` +
    `SELECT / WITH … SELECT is allowed; avoid SQL reserved keywords as output aliases (use row_count, ` +
    `not rows). Runs against the primary ${DIALECT} warehouse unless you pass a dataConnectionId. ` +
    `${dialectHint()}`,
  inputSchema: z.object({
    sql: z.string().describe('A single self-contained read-only SQL query.'),
    label: z.string().optional().describe('Short human label shown as the result table title.'),
    outputName: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .optional()
      .describe('snake_case name so a chart (build_chart) can bind to this result by name.'),
    dataConnectionId: z
      .string()
      .nullable()
      .optional()
      .describe('Optional data connection id to run against instead of the default warehouse.'),
  }),
  outputSchema: z.object({
    cellId: z.string(),
    outputName: z.string().nullable(),
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.any())),
    rowCount: z.number(),
    truncated: z.boolean(),
  }),
  execute: async (input) => {
    const datasourceId = input.dataConnectionId?.trim() || undefined;
    const connector = await getConnectorById(datasourceId ?? 'builtin');
    const result = await connector.runReadOnlySql(input.sql);
    return { cellId: randomUUID(), outputName: input.outputName?.trim() || null, ...result };
  },
});
