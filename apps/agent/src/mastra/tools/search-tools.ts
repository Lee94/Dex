import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * `SearchTools` (Hex) — search the agent's available tools by regex and return
 * matching names + one-line descriptions. Useful before claiming something can't
 * be done, or when unsure whether a suitable tool exists. The registry below is
 * kept in sync with the analyst's toolset (a static list avoids importing the
 * agent, which would be circular).
 */
const TOOL_REGISTRY: { name: string; description: string }[] = [
  {
    name: 'GetCurrentDateTime',
    description: 'Get the current date/time to anchor relative-date analysis.',
  },
  {
    name: 'ListDataConnections',
    description: 'List the data connections (databases) you can query.',
  },
  {
    name: 'FindTableSchemas',
    description: 'Discover candidate warehouse tables by keyword/topic.',
  },
  { name: 'ViewTables', description: 'Get verified schema + columns for exact known tables.' },
  {
    name: 'RunSQL',
    description: 'Run ephemeral read-only warehouse SQL (scratchpad; not shown to the user).',
  },
  { name: 'CreateSqlCell', description: 'Create a durable, re-runnable SQL cell in the notebook.' },
  {
    name: 'FindSemanticColumns',
    description: 'Search the semantic layer for dimensions and measures.',
  },
  {
    name: 'InspectSemanticData',
    description: 'List semantic projects/datasets or inspect a dataset schema + sample.',
  },
  {
    name: 'CreateSemanticTable',
    description: 'Materialize a semantic dataset (measures/dimensions) as a cell.',
  },
  {
    name: 'CellSearch',
    description: 'Inspect the notebook structure and specific cells (source/outputs).',
  },
  {
    name: 'ReadGuide',
    description: 'Read organization knowledge guides (definitions, conventions).',
  },
  { name: 'SaveMemory', description: 'Save a durable user preference for future conversations.' },
  { name: 'SuggestReview', description: 'Flag an answer for a data-team review (inline banner).' },
  { name: 'SearchWeb', description: 'Search the web for facts outside the warehouse (untrusted).' },
  { name: 'ExtractWeb', description: 'Extract content from specific web pages (untrusted).' },
  { name: 'GetFileContents', description: 'Read a user-uploaded file by id.' },
  {
    name: 'DelegateToDataDiscoveryAgent',
    description: 'Delegate data discovery to a specialist sub-agent.',
  },
  {
    name: 'DelegateToVisualizationAgent',
    description: 'Delegate chart/visualization work to a specialist sub-agent.',
  },
  {
    name: 'CreateTask',
    description: 'Schedule a read-only query to re-run on a cron with optional alerting.',
  },
  { name: 'ViewTask', description: 'View existing scheduled tasks.' },
  { name: 'ReadPastThreadSummary', description: 'Recall structured summaries of past threads.' },
  { name: 'SearchTools', description: 'Search available tools by regex pattern.' },
];

export const searchToolsTool = createTool({
  id: 'SearchTools',
  description:
    'Search available tools by regex pattern and return matching names + descriptions. Use this when ' +
    "you're unsure whether a suitable tool exists, before saying you cannot do something, or when a " +
    "task doesn't seem to fit your loaded tools. Search by action ('create|edit') or resource " +
    "('sql|semantic|chart'); alternation is supported.",
  inputSchema: z.object({
    pattern: z.string().describe('Regex pattern to match tool names/descriptions.'),
  }),
  outputSchema: z.object({
    tools: z.array(z.object({ name: z.string(), description: z.string() })),
  }),
  execute: async (input) => {
    let re: RegExp;
    try {
      re = new RegExp(input.pattern, 'i');
    } catch {
      // An invalid regex falls back to a case-insensitive substring match.
      const needle = input.pattern.toLowerCase();
      return {
        tools: TOOL_REGISTRY.filter(
          (t) =>
            t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle),
        ),
      };
    }
    return { tools: TOOL_REGISTRY.filter((t) => re.test(t.name) || re.test(t.description)) };
  },
});
