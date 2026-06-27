import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { visualizationAgent } from '../agents/visualization';

/**
 * `delegate_to_visualization` (Hex `DelegateToVisualizationAgent`) — hand all chart
 * work to the visualization specialist. You provide the analytical goal and the
 * data source(s) — for Dex, the **outputName of an upstream SQL cell** plus its
 * columns/types (pass *unaggregated* data; the chart aggregates). The specialist
 * autonomously authors a vinci DSL and **creates the viz cell itself**, returning a
 * short summary naming the cell it made (which you then embed with [cell:<id>]).
 *
 * The analyst's thread is forwarded so the sub-agent's `create_viz_cell` lands in
 * THIS thread's notebook.
 *
 * The viz cell is created **inside the sub-agent**, so its `create_viz_cell` tool
 * call never surfaces as a step in the analyst's own stream. We therefore lift the
 * created cell(s) out of the sub-agent run (cellId + the authored DSL + the upstream
 * `sourceOutputName`) and return them alongside the summary, so the web thread can
 * resolve `[cell:<id>]` and render the chart (over the matching SQL cell's rows).
 */

/** A viz cell the sub-agent created, lifted from its run for the analyst's stream. */
type CreatedVizCell = {
  cellId: string;
  sourceOutputName?: string;
  dsl?: Record<string, unknown>;
  label?: string;
};

// Mastra reports a run's tool calls/results as chunks: the call/result fields live
// under `.payload`. Read from there (falling back to the object itself, for safety
// across versions).
type ToolEntry = {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  payload?: { toolCallId?: string; toolName?: string; args?: unknown; result?: unknown };
};
type AgentToolTrace = { toolCalls?: ToolEntry[]; toolResults?: ToolEntry[] };
const fields = (e: ToolEntry) => e.payload ?? e;
const asObject = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;

// `create_viz_cell` is registered under the key `createVizCellTool`; Mastra reports
// the registry key as the tool name, but match the tool id too as a safety net.
const isVizTool = (name?: string) => name === 'createVizCellTool' || name === 'create_viz_cell';

/** Recover the viz cell(s) the sub-agent created: cellId from each `create_viz_cell`
 *  result, DSL + sourceOutputName + label from its call args. */
function createdVizCells(out: AgentToolTrace): CreatedVizCell[] {
  const argsById = new Map<string, Record<string, unknown>>();
  for (const c of out.toolCalls ?? []) {
    const p = fields(c);
    const args = asObject(p.args);
    if (isVizTool(p.toolName) && p.toolCallId && args) argsById.set(p.toolCallId, args);
  }
  const cells: CreatedVizCell[] = [];
  for (const r of out.toolResults ?? []) {
    const p = fields(r);
    if (!isVizTool(p.toolName)) continue;
    const cellId = asObject(p.result)?.cellId;
    if (typeof cellId !== 'string') continue;
    const args = asObject(p.args) ?? (p.toolCallId ? argsById.get(p.toolCallId) : undefined) ?? {};
    cells.push({
      cellId,
      sourceOutputName:
        typeof args.sourceOutputName === 'string' ? args.sourceOutputName : undefined,
      dsl: asObject(args.dsl),
      label: typeof args.label === 'string' ? args.label : undefined,
    });
  }
  return cells;
}

export const delegateVisualizationTool = createTool({
  id: 'DelegateToVisualizationAgent',
  description:
    'Delegate ALL visualization work to a visualization specialist sub-agent — creating, editing, and ' +
    'styling charts. It picks the right chart type, configures encodings, authors a vinci DSL, and ' +
    'creates the chart cell itself, returning a summary naming the new cell (embed it with ' +
    "[cell:<cellId>]). Before delegating, identify the data source(s): each source's `name` is the " +
    "upstream SQL cell's outputName, with its `columns` (name + type) and a `type` (use DATAFRAME for " +
    'a SQL cell output). Pass upstream, UNAGGREGATED data and let the specialist handle aggregation, ' +
    'temporal grouping, top N, binning, and percentages — do NOT pre-aggregate or specify the chart ' +
    'type/axes yourself unless the user explicitly requested one.',
  inputSchema: z.object({
    analyticalGoal: z
      .string()
      .describe('What the chart should communicate — the insight/question (the "why").'),
    dataSources: z
      .array(
        z.object({
          name: z.string().describe("The upstream SQL cell's outputName to visualize."),
          type: z
            .enum(['DATAFRAME', 'DATA_WAREHOUSE', 'SEMANTIC_DATASET', 'SEMANTIC_VIEW'])
            .nullable()
            .optional()
            .describe('Source type — use DATAFRAME for a SQL/semantic cell output.'),
          columns: z
            .array(z.object({ name: z.string(), type: z.string().nullable().optional() }))
            .nullable()
            .optional()
            .describe('The result columns and their types.'),
          description: z.string().nullable().optional(),
        }),
      )
      .min(1)
      .describe('The data source(s) to chart — usually one SQL cell output.'),
    userPreferences: z
      .string()
      .nullable()
      .optional()
      .describe('Any explicit user requests about the chart (type, styling), verbatim.'),
    notebookContext: z
      .string()
      .nullable()
      .optional()
      .describe('Relevant context about the notebook state.'),
    dataConnectionId: z.string().nullable().optional(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    // The viz cell(s) the sub-agent created — surfaced so the thread can render
    // the chart inline (the sub-agent's create_viz_cell isn't an analyst step).
    vizCells: z
      .array(
        z.object({
          cellId: z.string(),
          sourceOutputName: z.string().optional(),
          dsl: z.record(z.string(), z.any()).optional(),
          label: z.string().optional(),
        }),
      )
      .optional(),
  }),
  execute: async (input, ctx) => {
    const sources = input.dataSources
      .map((s) => {
        const cols = (s.columns ?? [])
          .map((c) => `${c.name}${c.type ? ` (${c.type})` : ''}`)
          .join(', ');
        return `- ${s.name}${cols ? ` — columns: ${cols}` : ''}${
          s.description ? ` — ${s.description}` : ''
        }`;
      })
      .join('\n');

    const prompt = `Analytical goal: ${input.analyticalGoal}
Data source(s) (each name is a SQL cell's outputName):
${sources}${input.userPreferences ? `\nUser preferences: ${input.userPreferences}` : ''}${
      input.notebookContext ? `\nNotebook context: ${input.notebookContext}` : ''
    }

Create the visualization now: author the surface DSL over the source's columns and call create_viz_cell with sourceOutputName set to the source's name.`;

    // Forward the analyst's thread so the sub-agent's create_viz_cell writes into
    // THIS thread's notebook (notebook id = threadId).
    const threadId = ctx?.agent?.threadId;
    const resourceId = ctx?.agent?.resourceId;
    const out = await visualizationAgent.generate(
      prompt,
      threadId ? { memory: { thread: threadId, resource: resourceId } } : {},
    );
    return { summary: out.text, vizCells: createdVizCells(out) };
  },
});
