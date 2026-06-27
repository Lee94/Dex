import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { validateVizDsl } from '../agents/viz-dsl-validate';

/**
 * `build_chart` — build a chart over an upstream SQL/semantic result's rows. You
 * (the visualization specialist) author a **vinci surface DSL** (a SurfaceDoc JSON)
 * and bind it to the upstream result's `outputName` via `sourceOutputName`; the web
 * compiles the DSL and renders it read-only with vinci.
 *
 * The chart is ephemeral to the conversation (there is no notebook) — it pre-flight
 * validates the DSL and returns a chart `id`. The analyst lifts the id + DSL +
 * sourceOutputName from this call so the thread can render the chart over the
 * matching result's rows. The data is the upstream rows — do NOT query here; the
 * chart aggregates per the DSL.
 */
export const buildChartTool = createTool({
  id: 'build_chart',
  description:
    "Build a chart over an upstream SQL/semantic result's rows. Provide that result's outputName as " +
    '`sourceOutputName` and a vinci surface DSL (`dsl`) describing the chart (chart type via geoms, ' +
    'x/y encodings, aggregations). The chart aggregates the upstream rows per the DSL — pass ' +
    'unaggregated upstream data and let the DSL group/sum. Returns a chart id; the analyst embeds it ' +
    'with [result:<id>] to show the chart.',
  inputSchema: z.object({
    sourceOutputName: z
      .string()
      .describe('The outputName of the SQL/semantic result whose rows this chart visualizes.'),
    dsl: z
      .record(z.string(), z.any())
      .describe(
        'The vinci surface DSL (SurfaceDoc) object: { dslVersion, dataVersion, name, fields, ' +
          'encoding, geoms, ... }. See your instructions for the format and examples.',
      ),
    label: z.string().optional().describe('Short human label for the chart.'),
  }),
  outputSchema: z.object({
    cellId: z.string(),
  }),
  execute: async (input) => {
    // Pre-flight compile check: catch a malformed DSL here (mirroring the web's
    // surface compiler) so it never reaches the thread as a broken chart. Throwing
    // surfaces the problem back to the visualization agent, which repairs and
    // retries within its step budget — instead of the web silently rendering
    // "Couldn't build this chart".
    const problems = validateVizDsl(input.dsl);
    if (problems.length > 0) {
      throw new Error(
        `The chart DSL is invalid and was not created. Fix these and call build_chart again:\n` +
          problems.map((p) => `- ${p}`).join('\n'),
      );
    }
    return { cellId: randomUUID() };
  },
});
