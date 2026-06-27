import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { parseCubeYaml, cubeToYaml } from '../db/semantic';

/**
 * `propose_cube` — validate a single user semantic model written in Dex cube YAML
 * and return the normalized cube + YAML. Mirrors `build_chart`'s contract: it
 * **pre-flight validates and does NOT persist** anything. The semantic-model
 * assistant calls it to hand a draft back to the editor; the user decides whether
 * to save a draft or publish. Invalid YAML throws with the problems so the agent
 * repairs and retries within its step budget — instead of proposing a broken model.
 */
export const proposeCubeTool = createTool({
  id: 'propose_cube',
  description:
    'Validate a single data model written in Dex cube YAML (top-level name/sql/measures/dimensions) ' +
    'and return the normalized cube + YAML. Does NOT save — the user reviews the proposal in the editor ' +
    'and decides whether to save a draft or publish. If the YAML is invalid this returns an error listing ' +
    'the problems; fix them and call propose_cube again.',
  inputSchema: z.object({
    yaml: z
      .string()
      .describe(
        'The cube definition in Dex cube YAML (top-level name, sql, measures, dimensions).',
      ),
  }),
  outputSchema: z.object({
    cube: z.record(z.string(), z.any()),
    yaml: z.string(),
  }),
  execute: async (input) => {
    const { cube, errors } = parseCubeYaml(input.yaml);
    if (!cube || errors.length > 0) {
      throw new Error(
        'The cube YAML is invalid and was not proposed. Fix these and call propose_cube again:\n' +
          errors.map((e) => `- ${e.message}`).join('\n'),
      );
    }
    return { cube, yaml: cubeToYaml(cube) };
  },
});
