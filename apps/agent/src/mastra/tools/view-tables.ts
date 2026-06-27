import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConnectorById } from '../db/connector';
import { getColumnMetadataMap, getTableMetadata } from '../db/metadata';
import { enrichTableDescription, type DescribedTable } from '../db/catalog';

/**
 * `ViewTables` (Hex) — verified schema for one or more EXACT, known warehouse
 * tables. Use immediately when a user, a guide, or prior tool output names a
 * specific table and you need its real columns before writing SQL. For keyword/
 * topic discovery (you don't know the table name yet) use `FindTableSchemas`.
 */
export const viewTablesTool = createTool({
  id: 'ViewTables',
  description:
    "Get verified schema and columns for one or more EXACT known warehouse tables — each table's " +
    'columns (name, type, nullability, primary key) plus a few sample rows. Use this immediately when ' +
    'a user, a guide, or prior tool output gives you a specific table name; verified schema should be ' +
    'obtained here before you write SQL against that table. Pass every table you need at once in ' +
    '`tableRefs` (exact names as returned by FindTableSchemas — preserve casing). Returns not-found ' +
    'guidance instead of guessing. Schema verification only confirms names; it does not prove a table ' +
    'is the right analytical source. Do NOT use this for keyword discovery — that is FindTableSchemas. ' +
    'Pass the same `dataConnectionId` you used with FindTableSchemas to inspect tables in another ' +
    'registered connection.',
  inputSchema: z.object({
    tableRefs: z
      .array(z.string())
      .min(1)
      .max(10)
      .describe(
        'Exact known table refs to inspect (table, schema.table, or database.schema.table).',
      ),
    dataConnectionId: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Optional data connection id to target another registered connection instead of the default warehouse.',
      ),
  }),
  outputSchema: z.object({
    dialect: z.string(),
    tables: z.array(
      z.object({
        table: z.string(),
        description: z.string().optional(),
        endorsed: z.boolean().optional(),
        columns: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              notnull: z.boolean(),
              primaryKey: z.boolean(),
              description: z.string().optional(),
              endorsed: z.boolean().optional(),
            }),
          )
          .optional(),
        sampleRows: z.array(z.record(z.string(), z.any())).optional(),
        error: z.string().optional(),
      }),
    ),
  }),
  execute: async (input) => {
    const dsId = input.dataConnectionId?.trim() || 'builtin';
    const connector = await getConnectorById(dsId);

    const results: DescribedTable[] = [];
    for (const name of input.tableRefs) {
      try {
        const [desc, tableMeta, colMeta] = await Promise.all([
          connector.describeTable(name),
          getTableMetadata(dsId, name),
          getColumnMetadataMap(dsId, name),
        ]);
        // Merge the curated catalog overlay (descriptions/endorsed + AI-exclude).
        results.push(enrichTableDescription(desc, tableMeta, colMeta));
      } catch (err) {
        // One bad table name shouldn't lose the others — report it inline.
        results.push({ table: name, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { dialect: connector.dialect, tables: results };
  },
});
