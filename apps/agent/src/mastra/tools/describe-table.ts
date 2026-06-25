import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConnectorById } from '../db/connector';
import type { TableDescription } from '../db/types';

/** One table's detail, or an error if that single table couldn't be inspected. */
type TableDetail = {
  table: string;
  columns?: TableDescription['columns'];
  sampleRows?: TableDescription['sampleRows'];
  error?: string;
};

export const describeTableTool = createTool({
  id: 'describe_table',
  description:
    "Inspect one or more tables in a single call — each table's columns (name, type, nullability, " +
    'primary key) plus a few sample rows. Pass ALL the tables you need in `tables` at once rather ' +
    'than calling this repeatedly. Use it when list_tables did not include columns, or when you ' +
    'want sample rows / keys before writing SQL. ' +
    'Pass the same `datasourceId` you used with list_tables to inspect tables in another registered data source.',
  inputSchema: z.object({
    tables: z
      .array(z.string())
      .optional()
      .describe(
        'Exact table names, as returned by list_tables. Pass every table you need at once.',
      ),
    table: z.string().optional().describe('Deprecated single-table alias; prefer `tables`.'),
    datasourceId: z
      .string()
      .optional()
      .describe(
        'Optional data source id to target another registered source instead of the default warehouse.',
      ),
  }),
  outputSchema: z.object({
    dialect: z.string(),
    tables: z.array(
      z.object({
        table: z.string(),
        columns: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              notnull: z.boolean(),
              primaryKey: z.boolean(),
            }),
          )
          .optional(),
        sampleRows: z.array(z.record(z.string(), z.any())).optional(),
        error: z.string().optional(),
      }),
    ),
  }),
  execute: async (input) => {
    const names = input.tables ?? (input.table ? [input.table] : []);
    if (names.length === 0) {
      throw new Error('Provide one or more table names in `tables`.');
    }
    const connector = await getConnectorById(input.datasourceId ?? 'builtin');

    const results: TableDetail[] = [];
    for (const name of names) {
      try {
        const desc = await connector.describeTable(name);
        results.push({ table: desc.table, columns: desc.columns, sampleRows: desc.sampleRows });
      } catch (err) {
        // One bad table name shouldn't lose the others — report it inline.
        results.push({ table: name, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { dialect: connector.dialect, tables: results };
  },
});
