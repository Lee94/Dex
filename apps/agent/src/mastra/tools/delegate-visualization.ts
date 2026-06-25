import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { visualizationAgent } from '../agents/visualization';

/**
 * `delegate_to_visualization` (Hex `DelegateToVisualizationAgent`) — ask the
 * visualization specialist how to present a result. You pass the question and the
 * result's shape (columns + types + a few sample values); it returns a chart-type
 * recommendation + x/measure mapping + title + notes, which you apply when you
 * render the result card (the v0.5 cards support table / bar / line / area).
 */
export const delegateVisualizationTool = createTool({
  id: 'delegate_to_visualization',
  description:
    'Delegate a visualization decision to a specialist sub-agent. Provide the question and a short ' +
    "description of the result's columns (names + types) and a few sample rows; get back a " +
    'recommended chart type (table/bar/line/area), the x / measure mapping, a title, and formatting ' +
    'notes. Apply the recommendation when you present the result card.',
  inputSchema: z.object({
    question: z.string().describe('The user question the result answers.'),
    columns: z
      .string()
      .describe('The result columns and their types, e.g. "month (date), revenue (number)".'),
    sample: z.string().optional().describe('A few sample rows, as text, to ground the choice.'),
  }),
  outputSchema: z.object({
    recommendation: z.string(),
  }),
  execute: async (input) => {
    const prompt = `Question: ${input.question}\nColumns: ${input.columns}${
      input.sample ? `\nSample rows:\n${input.sample}` : ''
    }\n\nRecommend how to visualize this.`;
    const out = await visualizationAgent.generate(prompt);
    return { recommendation: out.text };
  },
});
