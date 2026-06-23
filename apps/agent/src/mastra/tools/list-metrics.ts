import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listMetricsCatalog } from '../db/semantic';

export const listMetricsTool = createTool({
  id: 'list_metrics',
  description:
    'List the governed, named metrics available in the semantic model (e.g. revenue, completed_revenue, orders, average order value, cancellation rate, customers). ' +
    'PREFER these trusted, consistent definitions over re-deriving SQL by hand. ' +
    'Use describe_model to see the full cubes/measures/dimensions, then query_semantic to run a metric broken down by dimensions / time.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    metrics: z.array(
      z.object({
        name: z.string(),
        title: z.string(),
        description: z.string().optional(),
        measure: z.string(),
        format: z.string(),
        endorsed: z.boolean(),
      }),
    ),
  }),
  execute: async () => listMetricsCatalog(),
});
