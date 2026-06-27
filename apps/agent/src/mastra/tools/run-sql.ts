import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { dialectHint, getActiveProvider, getConnectorById } from '../db/connector';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

/**
 * `RunSQL` (Hex) — ephemeral, exploratory warehouse SQL. Results are shown to YOU
 * (the agent) but are NOT displayed to the user. Use it as a scratchpad to inform
 * downstream work; for any user-visible result use `ShowSql` instead.
 */
export const runSqlTool = createTool({
  id: 'RunSQL',
  description:
    `Run ephemeral, read-only exploratory SQL (SELECT, or WITH … SELECT). Results are shown to you ` +
    `but NOT shown to the user — use this as a scratchpad to inform downstream work, not as a final ` +
    `answer source (use ShowSql for user-visible analysis). Before calling this, you should already ` +
    `have inspected the ` +
    `relevant tables with ViewTables. By default it runs against the primary ${DIALECT} warehouse; ` +
    `pass a \`dataConnectionId\` (from ListDataConnections or the question context) to run against ` +
    `another connection, writing SQL for the dialect ViewTables reported for it. Write/DDL statements ` +
    `(INSERT/UPDATE/DELETE/DROP/…) and multiple statements are rejected. Keep queries small and use a ` +
    `LIMIT. For the default warehouse: ${dialectHint()}`,
  inputSchema: z.object({
    sql: z
      .string()
      .describe('A single read-only query. No multiple semicolon-separated statements.'),
    description: z
      .string()
      .optional()
      .describe(
        'At most four words, sentence case, starting with an action verb (e.g. "Check order grain").',
      ),
    dataConnectionId: z
      .string()
      .optional()
      .describe(
        'Optional data connection id to run against another registered connection instead of the default warehouse.',
      ),
  }),
  outputSchema: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.any())),
    rowCount: z.number(),
    truncated: z.boolean(),
  }),
  execute: async (input) => {
    const connector = await getConnectorById(input.dataConnectionId ?? 'builtin');
    return await connector.runReadOnlySql(input.sql);
  },
});
