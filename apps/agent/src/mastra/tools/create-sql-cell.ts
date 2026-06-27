import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { dialectHint, getActiveProvider, getConnectorById } from '../db/connector';
import { appendCell, getNotebook, type NotebookCell } from '../db/notebooks';
import { resolveChainedSql } from '../db/notebook-exec';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

/**
 * `CreateSqlCell` (Hex). Unlike `RunSQL` (ephemeral scratchpad), this creates a
 * **durable, re-runnable SQL cell** in THIS thread's notebook and returns its
 * output + a `cellId` to reference. Cells chain: give a cell an `outputName` and a
 * later cell can `FROM <outputName>` it (Dex inlines it as a CTE at run time).
 *
 * Schema parity with Hex: `location` (relative/child/top/bottom) maps to Dex's
 * append/after positioning; `mode`/`queryMode`/`usesDataframe` are accepted but
 * Dex executes everything through the read-only warehouse connector (chaining via
 * `outputName` is Dex's dataframe-equivalent) — no separate dataframe engine.
 */

const locationSchema = z
  .union([
    z.object({
      type: z.literal('relative'),
      targetCellId: z.string(),
      position: z.enum(['before', 'after']),
    }),
    z.object({
      type: z.literal('child'),
      parentCellId: z.string().nullable().optional(),
      position: z.enum(['first', 'last']),
    }),
    z.object({ type: z.literal('topOfNotebook') }),
    z.object({ type: z.literal('bottomOfNotebook') }),
  ])
  .optional()
  .describe('Where to place the new cell. Omit to append at the bottom.');

type Location = z.infer<typeof locationSchema>;

export const createSqlCellTool = createTool({
  id: 'CreateSqlCell',
  description:
    `Create a durable, re-runnable SQL cell in this thread's shared notebook and run it, returning ` +
    `columns + rows and a cellId. Use this (NOT RunSQL) for any query result the user should see or ` +
    `keep — then reference its output in your answer by putting [cell:<cellId>] on its own line where ` +
    `the table/chart should appear. Always reference prior SQL outputs by outputName (not table name); ` +
    `give a cell an \`outputName\` (snake_case) so a later cell can build on it with \`FROM ` +
    `<outputName>\` — prefer small composable cells over one giant CTE chain. Call CellSearch first to ` +
    `see existing cells and their output names. A SQL cell renders as a table; to chart a result, ` +
    `delegate to the visualization specialist. ONLY read-only SELECT / WITH … SELECT is allowed; avoid ` +
    `SQL reserved keywords as output aliases (use row_count, not rows). Runs against the primary ` +
    `${DIALECT} warehouse unless you pass a dataConnectionId. ${dialectHint()}`,
  inputSchema: z.object({
    sql: z
      .string()
      .describe('A single read-only SQL query. May reference an upstream cell by its outputName.'),
    label: z
      .string()
      .optional()
      .describe("Short human label; used as the notebook's title when it's the first cell."),
    outputName: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .optional()
      .describe('snake_case name so downstream cells can chain off this one (FROM name).'),
    location: locationSchema,
    mode: z
      .enum(['warehouse', 'dataframe'])
      .nullable()
      .optional()
      .describe(
        'Accepted for parity; Dex runs warehouse SQL (chaining via outputName covers dataframe).',
      ),
    queryMode: z.boolean().nullable().optional().describe('Accepted for parity; not used by Dex.'),
    usesDataframe: z
      .boolean()
      .nullable()
      .optional()
      .describe('Deprecated legacy selector; ignored.'),
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
  execute: async (input, ctx) => {
    const threadId = ctx?.agent?.threadId;
    const datasourceId = input.dataConnectionId?.trim() || undefined;
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
      const afterCellId = await resolveAfterCellId(threadId, input.location);
      const notebook = await appendCell(threadId, cell, {
        afterCellId,
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

/** Translate Hex's `location` into Dex's `afterCellId` (append when unmappable). */
async function resolveAfterCellId(
  threadId: string,
  location: Location,
): Promise<string | undefined> {
  if (!location) return undefined;
  if (location.type === 'relative') {
    if (location.position === 'after') return location.targetCellId;
    // 'before': place after the cell preceding the target (top → append fallback).
    const notebook = await getNotebook(threadId);
    const cells = notebook?.cells ?? [];
    const idx = cells.findIndex((c) => c.id === location.targetCellId);
    return idx > 0 ? cells[idx - 1].id : undefined;
  }
  // child / topOfNotebook / bottomOfNotebook → append (Dex has no nesting).
  return undefined;
}
