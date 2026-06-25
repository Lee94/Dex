import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConnectorById } from '../db/connector';

/**
 * For a warehouse with at most this many tables we attach each table's columns
 * to the listing, so the agent gets a one-shot schema map and can usually write
 * SQL without a separate describe_table round-trip. Above it we return names +
 * row counts only (to bound the payload) and the agent uses describe_table.
 */
const ENRICH_TABLE_CAP = 30;

export const listTablesTool = createTool({
  id: 'list_tables',
  description:
    'List the tables in a data warehouse with their row counts and the warehouse dialect. ' +
    "For normal-sized warehouses it ALSO returns each table's columns (name + type), so you " +
    'can often write SQL directly without a separate describe_table call. Call this FIRST to ' +
    'discover what data is available. ' +
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
    columnsIncluded: z
      .boolean()
      .describe('false for large warehouses — call describe_table to get columns in that case.'),
    tables: z.array(
      z.object({
        name: z.string(),
        rowCount: z.number(),
        columns: z.array(z.object({ name: z.string(), type: z.string() })).optional(),
      }),
    ),
  }),
  execute: async (input) => {
    const connector = await getConnectorById(input?.datasourceId ?? 'builtin');
    const tables = await connector.listTables();

    // Large warehouse: names + row counts only, to keep the payload bounded.
    if (tables.length > ENRICH_TABLE_CAP) {
      return { dialect: connector.dialect, columnsIncluded: false, tables };
    }

    // Small/normal warehouse: fold in each table's columns in one cheap bulk
    // call, so the agent can skip per-table describe_table round-trips.
    const schema = await connector.tableColumns();
    const byTable = new Map(schema.map((s) => [s.table, s.columns]));
    return {
      dialect: connector.dialect,
      columnsIncluded: true,
      tables: tables.map((t) => ({
        ...t,
        columns: (byTable.get(t.name) ?? []).map((c) => ({ name: c.name, type: c.type })),
      })),
    };
  },
});
