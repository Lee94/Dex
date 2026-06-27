import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { validateVizDsl } from '../agents/viz-dsl-validate';
import { appendCell, type NotebookCell } from '../db/notebooks';

/**
 * `create_viz_cell` — create a visualization cell in THIS thread's notebook that
 * charts an upstream SQL cell's output. You (the visualization specialist) author
 * a **vinci surface DSL** (a SurfaceDoc JSON) and bind it to the SQL cell's
 * `outputName`; the web compiles the DSL and renders it with vinci's chart editor.
 *
 * Mirrors `create_sql_cell`: it persists into the thread's notebook (notebook id =
 * threadId) via `appendCell`. The data is the upstream cell's rows — do NOT query
 * here; the chart layer aggregates per the DSL.
 */
export const createVizCellTool = createTool({
  id: 'create_viz_cell',
  description:
    "Create a visualization (chart) cell over an upstream SQL cell's output. Provide that cell's " +
    'outputName as `sourceOutputName` and a vinci surface DSL (`dsl`) describing the chart (chart ' +
    'type via geoms, x/y encodings, aggregations). The chart aggregates the upstream rows per the ' +
    'DSL — pass unaggregated upstream data and let the DSL group/sum. Returns the new cellId; embed ' +
    'it in the answer with [cell:<cellId>] to show the chart.',
  inputSchema: z.object({
    sourceOutputName: z
      .string()
      .describe('The outputName of the SQL cell whose rows this chart visualizes.'),
    dsl: z
      .record(z.string(), z.any())
      .describe(
        'The vinci surface DSL (SurfaceDoc) object: { dslVersion, dataVersion, name, fields, ' +
          'encoding, geoms, ... }. See your instructions for the format and examples.',
      ),
    label: z
      .string()
      .optional()
      .describe("Short human label; used as the notebook's title when it's the first cell."),
    afterCellId: z
      .string()
      .optional()
      .describe('Place the new cell right after this cell id; omit to append.'),
  }),
  outputSchema: z.object({
    cellId: z.string(),
    persisted: z.boolean(),
  }),
  execute: async (input, ctx) => {
    // Pre-flight compile check: catch a malformed DSL here (mirroring the web's
    // surface compiler) so it never lands as a broken cell. Throwing surfaces the
    // problem back to the visualization agent, which repairs and retries within its
    // step budget — instead of the web silently rendering "Couldn't build this chart".
    const problems = validateVizDsl(input.dsl);
    if (problems.length > 0) {
      throw new Error(
        `The chart DSL is invalid and was not created. Fix these and call create_viz_cell again:\n` +
          problems.map((p) => `- ${p}`).join('\n'),
      );
    }

    const threadId = ctx?.agent?.threadId;
    const cell: NotebookCell = {
      id: randomUUID(),
      kind: 'viz',
      source: '',
      sourceOutputName: input.sourceOutputName.trim() || undefined,
      dsl: input.dsl,
    };
    if (threadId) {
      await appendCell(threadId, cell, {
        afterCellId: input.afterCellId,
        titleIfNew: input.label,
      });
      return { cellId: cell.id, persisted: true };
    }
    // No thread context (e.g. a non-memory run): can't persist into a notebook.
    return { cellId: cell.id, persisted: false };
  },
});
