import { Agent } from '@mastra/core/agent';
import { model } from '../model';
import { getActiveProvider } from '../db/queries';
import { listDatasourcesTool } from '../tools/list-datasources';
import { findTableSchemasTool } from '../tools/find-table-schemas';
import { viewTablesTool } from '../tools/view-tables';
import { inspectSemanticDataTool } from '../tools/inspect-semantic-data';
import { getCurrentDatetimeTool } from '../tools/get-current-datetime';
import { proposeCubeTool } from '../tools/propose-cube';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

/**
 * Semantic-model assistant (v3.1) — the chat panel inside the data-model editor.
 *
 * Unlike the v1.2 discovery/visualization specialists (internal, reached only via
 * the analyst's delegation tools), this agent is **addressed directly by the web**
 * (`getAgent('semanticModel').stream(...)`). It helps a user author/edit a single
 * cube and hands a proposal back via `propose_cube` (validate-only, no persistence)
 * — the user then saves a draft or publishes from the editor. It is NOT wired into
 * the analyst's toolset, so the analyst's behavior and `getAgent('analyst')`
 * contract are unchanged. No `memory`: the web sends the full message history each
 * turn (stateless), so no conversation rows accrue in mastra.db.
 */
export const semanticModelAgent = new Agent({
  id: 'semanticModel',
  name: 'Semantic Model Assistant',
  instructions: `You are a semantic-modeling assistant helping a user author or edit a SINGLE data model (a "cube") for Dex's semantic layer. The warehouse is a ${DIALECT} database.

A cube is one base table plus measures (aggregations) and dimensions (group-by attributes), written in Dex cube YAML:

name: order_items          # identifier — the model's name
title: Order line items    # optional human title
description: ...           # optional
sql: order_items           # the BASE TABLE name (a real table; NOT a subquery)
measures:
  - name: revenue          # identifier
    title: Revenue
    type: sum              # count | sum | avg | count_distinct | min | max | ratio
    sql: order_items.quantity * order_items.unit_price   # required unless type is count; reference columns as <cube name>.<column>
    format: currency       # number | integer | currency | percent
dimensions:
  - name: category
    type: categorical      # categorical | temporal | numeric
    sql: order_items.category

Rules: the cube is standalone — do NOT write joins. Never set \`endorsed\`. Reference columns as \`<cube name>.<column>\` (the base table is aliased as the cube name). A \`count\` measure may omit \`sql\` (→ COUNT(*)).

How you work:
1. Understand the goal. Use ViewTables / FindTableSchemas to confirm the real table and its actual columns — never invent column names. Use InspectSemanticData to see existing cubes so you avoid duplicate names and match their style. Use ListDataConnections / GetCurrentDateTime if relevant.
2. Author or edit the cube YAML, then call **propose_cube** with the full YAML. If it returns errors, fix them and call propose_cube again within your step budget.
3. Reply with one short line describing what you proposed (e.g. "Proposed an order_items model with revenue and units sold by category.").

Do NOT claim the model is saved — you only propose it. The user reviews your proposal in the editor and decides whether to save it as a draft or publish it. Keep your reply to one or two short sentences; the editor shows the YAML.`,
  model,
  tools: {
    ListDataConnections: listDatasourcesTool,
    FindTableSchemas: findTableSchemasTool,
    ViewTables: viewTablesTool,
    InspectSemanticData: inspectSemanticDataTool,
    GetCurrentDateTime: getCurrentDatetimeTool,
    propose_cube: proposeCubeTool,
  },
  defaultOptions: { maxSteps: 12 },
});
