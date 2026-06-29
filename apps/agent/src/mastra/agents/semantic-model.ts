import { Agent } from '@mastra/core/agent';
import { model } from '../model';
import { getActiveProvider } from '../db/queries';
import { findTableSchemasTool } from '../tools/find-table-schemas';
import { viewTablesTool } from '../tools/view-tables';
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

You are bound to ONE data connection — the user's message states which, with its id and dialect. Pass that dataConnectionId to EVERY ViewTables / FindTableSchemas call and author the cube ONLY from that connection's real tables and columns. You have NO access to any other data connection, nor to other semantic models or cubes (e.g. the built-in Dex semantic model) — never query, reference, read, or copy from them; their tables are unrelated and must not appear in this model. Every measure/dimension must resolve to a column you confirmed exists in the base table of the bound connection.

How you work:
1. Understand the goal. Use ViewTables / FindTableSchemas (always with the bound dataConnectionId) to confirm the real table and its actual columns — never invent column names. Use GetCurrentDateTime if relevant.
2. Author or edit the cube YAML, then call **propose_cube** with the full YAML. If it returns errors, fix them and call propose_cube again within your step budget.
3. Reply with one short line describing what you proposed (e.g. "Proposed an order_items model with revenue and units sold by category.").

Do NOT claim the model is saved — you only propose it. The user reviews your proposal in the editor and decides whether to save it as a draft or publish it. Keep your reply to one or two short sentences; the editor shows the YAML.`,
  model,
  tools: {
    FindTableSchemas: findTableSchemasTool,
    ViewTables: viewTablesTool,
    GetCurrentDateTime: getCurrentDatetimeTool,
    propose_cube: proposeCubeTool,
  },
  // Discovery here is multi-round (FindTableSchemas/ViewTables are each called
  // several times) and a request often spans more than one table,
  // so 12 steps ran out mid-build — the run hit the budget with finishReason
  // 'tool-calls' (still wanting to call tools) and ended abruptly, before authoring
  // every cube and writing the closing summary. 40 gives room to discover, propose
  // each cube, repair validation errors, and finish even on batch (multi-table)
  // requests. (The analyst runs at 20.)
  defaultOptions: { maxSteps: 40 },
});
