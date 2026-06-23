import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { describeModelSummary } from '../db/semantic';

export const describeModelTool = createTool({
  id: 'describe_model',
  description:
    'Describe the semantic model: its cubes (entities), the measures (aggregations) and dimensions (attributes) on each, the joins between cubes, and the named metrics. ' +
    'Use this to discover what you can ask for, then call query_semantic. Reference members as "cube.measure" / "cube.dimension" (e.g. "order_items.revenue", "products.category"). ' +
    'Endorsed cubes/measures/metrics are trusted definitions — prefer them.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    dialect: z.string(),
    cubes: z.array(z.any()),
    metrics: z.array(z.any()),
  }),
  execute: async () => describeModelSummary(),
});
