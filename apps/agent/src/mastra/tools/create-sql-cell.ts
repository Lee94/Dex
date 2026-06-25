import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { dialectHint, getActiveProvider, getConnectorById } from '../db/connector';
import { appendCell, type NotebookCell } from '../db/notebooks';
import { resolveChainedSql } from '../db/notebook-exec';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

/**
 * Hex's `CreateSqlCell` analogue. Unlike `run_sql` (ephemeral scratchpad), this
 * creates a **durable, re-runnable SQL cell** in THIS thread's notebook and
 * returns its output + a `cellId` to reference. Cells chain: give a cell an
 * `outputName` and a later cell can `FROM <outputName>` it.
 */
export const createSqlCellTool = createTool({
  id: 'create_sql_cell',
  description:
    `Create a durable, re-runnable SQL cell in this thread's shared notebook and run it, returning columns + rows and a cellId. ` +
    `Use this (NOT run_sql) for any query result the user should see or keep — then reference its output in your answer by putting [cell:<cellId>] on its own line where the table/chart should appear. ` +
    `Give a cell an \`outputName\` (snake_case) so a later cell can build on it with \`FROM <outputName>\` — prefer small chained cells over one giant query. Call read_cells first to see existing cells and their output names. ` +
    `Only read-only SELECT / WITH … SELECT is allowed. Runs against the primary ${DIALECT} warehouse unless you pass a datasourceId. ${dialectHint()}`,
  inputSchema: z.object({
    sql: z
      .string()
      .describe('A single read-only SQL query. May reference an upstream cell by its outputName.'),
    outputName: z
      .string()
      .optional()
      .describe('Optional snake_case name so downstream cells can chain off this one (FROM name).'),
    afterCellId: z
      .string()
      .optional()
      .describe('Place the new cell right after this cell id (from read_cells); omit to append.'),
    datasourceId: z
      .string()
      .optional()
      .describe('Optional data source id to run against instead of the default warehouse.'),
    label: z
      .string()
      .optional()
      .describe("Short human label; used as the notebook's title when it's the first cell."),
  }),
  outputSchema: z.object({
    cellId: z.string(),
    outputName: z.string().nullable(),
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.any())),
    rowCount: z.number(),
    truncated: z.boolean(),
  }),
  execute: async (input, ctx) => {
    const threadId = ctx?.agent?.threadId;
    const datasourceId = input.datasourceId?.trim() || undefined;
    const connector = await getConnectorById(datasourceId ?? 'builtin');
    const cellId = randomUUID();
    const cell: NotebookCell = {
      id: cellId,
      kind: 'sql',
      source: input.sql,
      outputName: input.outputName?.trim() || undefined,
      datasourceId,
    };

    // With a thread we persist the cell into that thread's notebook and run it in
    // context (so chained outputNames resolve); without one (e.g. a non-memory
    // run) we just run the SQL as written.
    if (threadId) {
      const notebook = await appendCell(threadId, cell, {
        afterCellId: input.afterCellId,
        titleIfNew: input.label,
      });
      const composed = resolveChainedSql(notebook.cells, cellId);
      const result = await connector.runReadOnlySql(composed);
      return { cellId, outputName: cell.outputName ?? null, ...result };
    }
    const result = await connector.runReadOnlySql(input.sql);
    return { cellId, outputName: cell.outputName ?? null, ...result };
  },
});
