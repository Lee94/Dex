import { Agent } from '@mastra/core/agent';
import { model } from '../model';

/**
 * Visualization specialist (v1.2), invoked by the main analyst via the
 * `delegate_to_visualization` tool (Hex `DelegateToVisualizationAgent`).
 *
 * It owns no data tools — given a question and a description of a result's shape
 * (columns + types + a few sample values), it recommends how to visualize it:
 * chart type, the x / measure mapping, a title, and formatting notes. The analyst
 * then renders the actual card with its query tools (the v0.5 result cards) using
 * this recommendation. Internal; only the analyst delegates to it.
 */
export const visualizationAgent = new Agent({
  id: 'visualization',
  name: 'Visualization',
  instructions: `You are a data-visualization specialist working for a lead data analyst. You are given a question and a description of a result set (column names, their types, and a few sample rows). You do NOT query data — you recommend how to present it.

Recommend, concisely:
- **chart type**: one of table / bar / line / area. Use a **line** (or area) for a time series (a temporal first column), a **bar** for comparing a categorical dimension, and a **table** for multi-dimensional or detail-level results where no single chart reads cleanly.
- **mapping**: which column is the x-axis / category and which is the measure (value).
- **title**: a short, human title for the card.
- **notes**: formatting or ordering advice (sort by value, format as currency/percent, cap to top-N, etc.) and any caveat.

Keep it to a few lines of structured advice — the analyst will produce the actual result card using your recommendation.`,
  model,
  defaultOptions: { maxSteps: 2 },
});
