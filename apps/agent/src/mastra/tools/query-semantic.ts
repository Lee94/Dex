import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runSemanticQuery } from '../db/semantic';

const filterSchema = z.object({
  member: z.string().describe('A "cube.dimension" to filter on, e.g. "orders.status".'),
  operator: z.enum(['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']),
  values: z.array(z.union([z.string(), z.number()])).min(1),
});

export const querySemanticTool = createTool({
  id: 'query_semantic',
  description:
    'Answer a question through the semantic model instead of hand-written SQL: pick measures (metric names like "revenue" / "completed_revenue", or "cube.measure" refs), optional dimensions to group by, an optional time dimension + granularity, filters, order, and limit. ' +
    'The layer compiles correct, governed, read-only SQL and resolves the needed joins automatically. ' +
    'PREFER this when a definition fits the question; fall back to run_sql only for the long tail the model does not cover. Call describe_model / list_metrics first to learn the members.',
  inputSchema: z.object({
    measures: z
      .array(z.string())
      .min(1)
      .describe('Metric names (e.g. "revenue", "orders") or "cube.measure" refs.'),
    dimensions: z
      .array(z.string())
      .optional()
      .describe('"cube.dimension" refs to group by, e.g. ["products.category"].'),
    timeDimension: z
      .object({
        dimension: z.string().describe('A temporal "cube.dimension", e.g. "orders.order_date".'),
        granularity: z.enum(['day', 'week', 'month', 'quarter', 'year']),
      })
      .optional(),
    filters: z.array(filterSchema).optional(),
    order: z
      .array(z.object({ member: z.string(), direction: z.enum(['asc', 'desc']) }))
      .optional()
      .describe('Order by an output column alias (a measure or dimension name).'),
    limit: z.number().int().positive().optional(),
  }),
  outputSchema: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.any())),
    rowCount: z.number(),
    truncated: z.boolean(),
    sql: z.string(),
    endorsed: z.boolean(),
    via: z.literal('semantic'),
    measures: z.array(z.string()),
    dimensions: z.array(z.string()),
    cubes: z.array(z.string()),
  }),
  execute: async (input) => runSemanticQuery(input),
});
