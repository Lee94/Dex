import { Agent } from '@mastra/core/agent';
import { model } from '../model';
import { buildChartTool } from '../tools/build-chart';
import { VIZ_DSL_REFERENCE } from './viz-dsl-reference';

/**
 * Visualization specialist (Hex `DelegateToVisualizationAgent`), invoked by the
 * analyst via `delegate_to_visualization`.
 *
 * Autonomous (Hex-style): given an analytical goal + the upstream data source
 * (a result's outputName + its columns/types), it **owns the chart** — it picks
 * the chart type, authors a vinci **surface DSL**, and builds the chart itself with
 * `build_chart` (binding it to the source's outputName). It does NOT query data; the
 * chart aggregates the upstream rows per the DSL's encoding. Internal; only the
 * analyst delegates to it. The chart it builds is ephemeral to the conversation —
 * there is no notebook; the analyst lifts the chart from this run and the web
 * renders it over the upstream result's rows.
 */
export const visualizationAgent = new Agent({
  id: 'visualization',
  name: 'Visualization',
  instructions: `You are a data-visualization specialist working for a lead data analyst. You OWN visualization: given an analytical goal and a description of the data (an upstream result's outputName + its columns and types, plus a few sample rows), you choose the best chart and BUILD it.

How you work:
1. Decide the chart from the goal and the columns: a **time series** (a date/time dimension) → line; a **comparison across categories** → bars (interval); **part-of-whole** → bars (interval — there is no pie geom); two measures over one dimension → multi-series.
2. Author a **vinci surface DSL** (see the reference below) over the source's columns — declare the fields, map the dimension(s) to \`x\` and the measure(s) to \`y\`, set the geom, and let the encoding's summary/group do the aggregation (do NOT assume the data is pre-aggregated).
3. Call **build_chart** with the source's \`sourceOutputName\` and your \`dsl\`. That builds the chart and returns its id.
4. Reply with one short line naming the chart you built and the chart you chose (e.g. "Built a line chart of revenue by month"). The analyst embeds it.

Use exact column names. Don't pre-aggregate or pre-filter — express that in the DSL. Keep your reply to one line; the analyst writes the user-facing answer.

${VIZ_DSL_REFERENCE}`,
  model,
  tools: {
    build_chart: buildChartTool,
  },
  defaultOptions: { maxSteps: 5 },
});
