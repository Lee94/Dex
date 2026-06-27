import { Agent } from '@mastra/core/agent';
import { model } from '../model';
import { createVizCellTool } from '../tools/create-viz-cell';
import { cellSearchTool } from '../tools/cell-search';
import { VIZ_DSL_REFERENCE } from './viz-dsl-reference';

/**
 * Visualization specialist (Hex `DelegateToVisualizationAgent`), invoked by the
 * analyst via `delegate_to_visualization`.
 *
 * Autonomous (Hex-style): given an analytical goal + the upstream data source
 * (a SQL cell's outputName + its columns/types), it **owns the chart** — it picks
 * the chart type, authors a vinci **surface DSL**, and creates the viz cell itself
 * with `create_viz_cell` (binding it to the source's outputName). It does NOT query
 * data; the chart aggregates the upstream rows per the DSL's encoding. Internal;
 * only the analyst delegates to it. It runs in the analyst's thread, so the cell it
 * creates lands in that thread's notebook.
 */
export const visualizationAgent = new Agent({
  id: 'visualization',
  name: 'Visualization',
  instructions: `You are a data-visualization specialist working for a lead data analyst. You OWN visualization: given an analytical goal and a description of the data (an upstream SQL cell's outputName + its columns and types, plus a few sample rows), you choose the best chart and CREATE it.

How you work:
1. Decide the chart from the goal and the columns: a **time series** (a date/time dimension) → line; a **comparison across categories** → bars (interval); **part-of-whole** → bars (interval — there is no pie geom); two measures over one dimension → multi-series.
2. Author a **vinci surface DSL** (see the reference below) over the source's columns — declare the fields, map the dimension(s) to \`x\` and the measure(s) to \`y\`, set the geom, and let the encoding's summary/group do the aggregation (do NOT assume the data is pre-aggregated).
3. Call **create_viz_cell** with the source's \`sourceOutputName\` and your \`dsl\`. That creates the chart cell in the notebook and returns its cellId.
4. Reply with one short line naming the cellId you created and the chart you chose (e.g. "Created [cell:<id>] — a line chart of revenue by month"). The analyst embeds it.

Use CellSearch if you need to confirm the upstream cell's outputName or columns. Use exact column names. Don't pre-aggregate or pre-filter — express that in the DSL. Keep your reply to one line; the analyst writes the user-facing answer.

${VIZ_DSL_REFERENCE}`,
  model,
  tools: {
    create_viz_cell: createVizCellTool,
    CellSearch: cellSearchTool,
  },
  defaultOptions: { maxSteps: 5 },
});
