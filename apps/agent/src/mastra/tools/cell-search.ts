import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getNotebook, type NotebookCell } from '../db/notebooks';
import { resolveChainedSql } from '../db/notebook-exec';
import { getConnectorById } from '../db/connector';

/**
 * `CellSearch` (Hex), scoped to THIS thread's notebook. Lets the agent inspect the
 * notebook's structure and specific cells — their ids, output names, source, and
 * (on request) outputs — so it can build on them: reuse an outputName, chain a new
 * cell off one (`FROM <outputName>`), or position a new cell.
 *
 * Dex's notebook is a flat ordered list (no Python/variable dependency graph), so
 * the `variable` selector best-effort matches cells by `outputName` and the DAG
 * `direction`/`depth`/`slice` knobs are accepted for parity but not traversed.
 */

const selectorSchema = z.union([
  z.object({ kind: z.literal('notebook') }),
  z.object({
    kind: z.literal('variable'),
    names: z.array(z.string().min(1)).min(1),
    role: z.enum(['defs', 'refs', 'both']).nullable().optional(),
  }),
  z.object({
    kind: z.literal('cell'),
    ids: z.array(z.string()).min(1),
    direction: z.enum(['up', 'down', 'both']).nullable().optional(),
    depth: z.number().int().nullable().optional(),
    slice: z.any().nullable().optional(),
  }),
]);

export const cellSearchTool = createTool({
  id: 'CellSearch',
  description:
    "Inspect this thread's notebook structure or targeted cells — their source code and, on request, " +
    'outputs. Use it to see existing cells and their output names before CreateSqlCell so you can ' +
    'chain off one by its outputName, reference a cellId in your answer with [cell:<cellId>], or ' +
    'position a new cell. Selectors: {kind:"notebook"} for a broad view of the notebook; ' +
    '{kind:"cell", ids:[…]} for specific cells; {kind:"variable", names:[…]} to find the cell that ' +
    'produces a given outputName. Payload: minimal (headers/metadata), source (source only), outputs ' +
    '(run + return outputs), or full (source + outputs). Empty when no cells exist yet.',
  inputSchema: z.object({
    selector: selectorSchema,
    payload: z.enum(['minimal', 'source', 'outputs', 'full']).nullable().optional(),
  }),
  outputSchema: z.object({
    cells: z.array(
      z.object({
        cellId: z.string(),
        kind: z.string(),
        outputName: z.string().nullable(),
        source: z.string().optional(),
        output: z
          .object({
            columns: z.array(z.string()),
            rows: z.array(z.record(z.string(), z.any())),
            rowCount: z.number(),
            truncated: z.boolean(),
          })
          .optional(),
        error: z.string().optional(),
      }),
    ),
    note: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const threadId = ctx?.agent?.threadId;
    if (!threadId) return { cells: [] };
    const notebook = await getNotebook(threadId);
    const all = notebook?.cells ?? [];
    const payload = input.payload ?? 'minimal';
    const wantSource = payload === 'source' || payload === 'full';
    const wantOutputs = payload === 'outputs' || payload === 'full';

    // Which cells the selector targets.
    let selected: NotebookCell[];
    let note: string | undefined;
    if (input.selector.kind === 'cell') {
      const ids = new Set(input.selector.ids);
      selected = all.filter((c) => ids.has(c.id));
    } else if (input.selector.kind === 'variable') {
      const names = new Set(input.selector.names);
      selected = all.filter((c) => c.outputName && names.has(c.outputName));
      note =
        'Dex notebooks have no variable dependency graph; matched cells by outputName (role/direction ignored).';
    } else {
      selected = all;
    }

    const cells = [];
    for (const c of selected) {
      const entry: {
        cellId: string;
        kind: string;
        outputName: string | null;
        source?: string;
        output?: {
          columns: string[];
          rows: Record<string, unknown>[];
          rowCount: number;
          truncated: boolean;
        };
        error?: string;
      } = { cellId: c.id, kind: c.kind, outputName: c.outputName ?? null };
      if (wantSource || input.selector.kind !== 'notebook') entry.source = c.source;
      if (wantOutputs && c.kind === 'sql') {
        try {
          const connector = await getConnectorById(c.datasourceId ?? 'builtin');
          const composed = resolveChainedSql(all, c.id);
          entry.output = await connector.runReadOnlySql(composed);
        } catch (err) {
          entry.error = err instanceof Error ? err.message : String(err);
        }
      }
      cells.push(entry);
    }
    return { cells, note };
  },
});
