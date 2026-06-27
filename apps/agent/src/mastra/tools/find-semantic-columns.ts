import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { loadMergedModel } from '../db/semantic';

/** Dex has a single semantic project; this is its name (used across the semantic tools). */
export const SEMANTIC_PROJECT = 'dex';

/**
 * `FindSemanticColumns` (Hex) — search the semantic layer for dimensions and
 * measures by keyword. Dex's model is a small typed config (no vector index), so
 * this is keyword/substring matching over member name, description, and dataset,
 * ranked by relevance. Returns columns with kind (dimension/measure), type,
 * description, dataset, project, and endorsed status — bias toward endorsed.
 */
export const findSemanticColumnsTool = createTool({
  id: 'FindSemanticColumns',
  description:
    'Search for dimensions and measures in the semantic layer. Returns columns with name, kind ' +
    '(dimension/measure), type, description, dataset, project, and endorsed status. Use specific, ' +
    'high-signal terms and keep the topic anchor in every query (e.g. "revenue completed orders"). ' +
    'Measures are pre-aggregated — use them directly without additional aggregation; dimensions are ' +
    'grouping/detail fields and can be aggregated (count, min, max). Prioritize endorsed datasets — ' +
    'they are curated for reliability. If the semantic layer defines the same data as a warehouse ' +
    'table, bias toward the semantic layer. After choosing fields, surface them with ' +
    'ShowSemanticTable rather than re-deriving the same number in raw SQL.',
  inputSchema: z.object({
    query: z.string().describe('Keyword search over semantic members (3-10 high-signal tokens).'),
    dataConnectionId: z.string().nullable().optional(),
  }),
  outputSchema: z.object({
    columns: z.array(
      z.object({
        name: z.string().describe('Field name (use as fieldName in ShowSemanticTable).'),
        ref: z.string().describe('Fully-qualified "dataset.field" reference.'),
        kind: z.enum(['dimension', 'measure']),
        type: z.string(),
        description: z.string().optional(),
        dataset: z.string(),
        project: z.string(),
        endorsed: z.boolean(),
      }),
    ),
  }),
  execute: async (input) => {
    const model = await loadMergedModel();
    type Col = {
      name: string;
      ref: string;
      kind: 'dimension' | 'measure';
      type: string;
      description?: string;
      dataset: string;
      project: string;
      endorsed: boolean;
    };
    const all: Col[] = [];
    for (const cube of model.cubes) {
      for (const m of cube.measures) {
        all.push({
          name: m.name,
          ref: `${cube.name}.${m.name}`,
          kind: 'measure',
          type: m.type,
          description: m.description,
          dataset: cube.name,
          project: SEMANTIC_PROJECT,
          endorsed: !!m.endorsed,
        });
      }
      for (const d of cube.dimensions) {
        all.push({
          name: d.name,
          ref: `${cube.name}.${d.name}`,
          kind: 'dimension',
          type: d.type,
          description: d.description,
          dataset: cube.name,
          project: SEMANTIC_PROJECT,
          endorsed: !!cube.endorsed,
        });
      }
    }

    const tokens = input.query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);
    const scored = all.map((c) => {
      const hay = `${c.name} ${c.description ?? ''} ${c.dataset}`.toLowerCase();
      let score = tokens.length === 0 ? 1 : 0;
      for (const tok of tokens) {
        if (c.name.toLowerCase().includes(tok)) score += 3;
        else if (hay.includes(tok)) score += 1;
      }
      if (c.endorsed) score += 0.5;
      return { c, score };
    });

    const columns = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ c }) => c);
    return { columns };
  },
});
