import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConnectorById } from '../db/connector';
import { loadMergedModel } from '../db/semantic';
import { SEMANTIC_PROJECT } from './find-semantic-columns';

/**
 * `InspectSemanticData` (Hex) — inspect the semantic layer at three levels:
 *   - no args → list projects (Dex has one) with dataset counts
 *   - projectName only → list datasets (cubes) in the project + their measures/dims
 *   - projectName + resourceName → full schema (measures, dimensions, joins) AND a
 *     sample-data preview (dimension values) for that dataset
 */
export const inspectSemanticDataTool = createTool({
  id: 'InspectSemanticData',
  description:
    'Inspect semantic data at multiple levels. With NO arguments, lists all semantic projects with ' +
    'descriptions and resource counts (discover what is available). With `projectName` only, lists ' +
    'the datasets in that project. With `projectName` + `resourceName`, returns the full schema ' +
    '(dimensions, measures, joins) AND a sample-data preview of dimension values for that dataset — ' +
    'use this to understand a dataset before running a ShowSemanticTable over it. Endorsed datasets ' +
    'are curated; prefer them.',
  inputSchema: z.object({
    projectName: z.string().nullable().optional(),
    resourceName: z.string().nullable().optional(),
    dataConnectionId: z.string().nullable().optional(),
  }),
  outputSchema: z.object({
    projects: z
      .array(z.object({ name: z.string(), description: z.string(), datasetCount: z.number() }))
      .optional(),
    datasets: z
      .array(
        z.object({
          name: z.string(),
          title: z.string(),
          description: z.string().optional(),
          endorsed: z.boolean(),
          measures: z.array(z.string()),
          dimensions: z.array(z.string()),
        }),
      )
      .optional(),
    dataset: z.any().optional(),
    sample: z
      .object({ columns: z.array(z.string()), rows: z.array(z.record(z.string(), z.any())) })
      .optional(),
    found: z.boolean().optional(),
  }),
  execute: async (input) => {
    const model = await loadMergedModel();

    // Level 1: no project → list projects.
    if (!input.projectName) {
      return {
        projects: [
          {
            name: SEMANTIC_PROJECT,
            description: 'The Dex e-commerce semantic model (governed metrics + cubes).',
            datasetCount: model.cubes.length,
          },
        ],
      };
    }

    // Level 3: project + resource → schema + sample preview.
    if (input.resourceName) {
      const cube = model.cubes.find(
        (c) => c.name.toLowerCase() === input.resourceName!.toLowerCase(),
      );
      if (!cube) {
        return {
          found: false,
          datasets: model.cubes.map((c) => ({
            name: c.name,
            title: c.title ?? c.name,
            description: c.description,
            endorsed: !!c.endorsed,
            measures: c.measures.map((m) => m.name),
            dimensions: c.dimensions.map((d) => d.name),
          })),
        };
      }
      const dataset = {
        name: cube.name,
        title: cube.title ?? cube.name,
        description: cube.description,
        endorsed: !!cube.endorsed,
        measures: cube.measures.map((m) => ({
          name: m.name,
          ref: `${cube.name}.${m.name}`,
          type: m.type,
          description: m.description,
          endorsed: !!m.endorsed,
        })),
        dimensions: cube.dimensions.map((d) => ({
          name: d.name,
          ref: `${cube.name}.${d.name}`,
          type: d.type,
          description: d.description,
        })),
        joins: (cube.joins ?? []).map((j) => ({ to: j.to, relationship: j.relationship })),
      };

      // Sample preview: dimension values only (Hex previews dimensions, not measures).
      let sample: { columns: string[]; rows: Record<string, unknown>[] } | undefined;
      if (cube.dimensions.length > 0) {
        try {
          const connector = await getConnectorById(input.dataConnectionId?.trim() || 'builtin');
          const select = cube.dimensions.map((d) => `${d.sql} AS ${d.name}`).join(', ');
          const sql = `SELECT ${select} FROM ${cube.sql} AS ${cube.name} LIMIT 10`;
          const res = await connector.runReadOnlySql(sql);
          sample = { columns: res.columns, rows: res.rows };
        } catch {
          // A preview failure shouldn't sink the schema response.
          sample = undefined;
        }
      }
      return { found: true, dataset, sample };
    }

    // Level 2: project only → list datasets.
    return {
      datasets: model.cubes.map((c) => ({
        name: c.name,
        title: c.title ?? c.name,
        description: c.description,
        endorsed: !!c.endorsed,
        measures: c.measures.map((m) => m.name),
        dimensions: c.dimensions.map((d) => d.name),
      })),
    };
  },
});
