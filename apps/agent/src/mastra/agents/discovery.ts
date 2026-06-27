import { Agent } from '@mastra/core/agent';
import { model } from '../model';
import { getActiveProvider } from '../db/queries';
import { findTableSchemasTool } from '../tools/find-table-schemas';
import { viewTablesTool } from '../tools/view-tables';
import { findSemanticColumnsTool } from '../tools/find-semantic-columns';
import { inspectSemanticDataTool } from '../tools/inspect-semantic-data';
import { listDatasourcesTool } from '../tools/list-datasources';
import { getCurrentDatetimeTool } from '../tools/get-current-datetime';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

/**
 * Data-discovery specialist (v1.2), invoked by the main analyst via the
 * `DelegateToDataDiscoveryAgent` tool.
 *
 * It owns the read-only discovery tools and produces a compact **discovery
 * brief** — which connections/tables/columns/metrics are relevant, their grain,
 * and how to join them — without writing the final analytical query or answering
 * the user. Keeping discovery in a focused sub-agent keeps the main analyst's
 * context lean and lets it fan out across connections. It is internal: the web
 * never addresses it; only the analyst delegates to it.
 */
export const dataDiscoveryAgent = new Agent({
  id: 'dataDiscovery',
  name: 'Data Discovery',
  instructions: `You are a data-discovery specialist working for a lead data analyst. The warehouse is a ${DIALECT} database with a semantic model (governed metrics + datasets).

Given a discovery task, map the data needed to answer it. Be thorough but fast, and run discovery calls in parallel when practical:
- Use ListDataConnections to see every connection (pass a dataConnectionId to inspect a non-primary one).
- For the governed semantic model, use FindSemanticColumns (search measures/dimensions by concept) and InspectSemanticData (dataset schema + sample values). Prefer the semantic layer when it has the needed members.
- For raw tables, use FindTableSchemas for keyword discovery and ViewTables for verified schema of an exact table.
- Use GetCurrentDateTime if the task involves relative dates.

Prefer endorsed, well-described tables/columns and trusted metrics. Note the grain of each relevant table and the keys to join them on.

Return a CONCISE discovery brief (not prose): the relevant connection(s), the specific tables + columns (or semantic measures/dimensions and their dataset), their grain, the join path, and any caveat (ambiguous fields, units, status filters). Do NOT write the final analytical SQL and do NOT answer the user's question — just hand back the map the analyst will build on.`,
  model,
  tools: {
    ListDataConnections: listDatasourcesTool,
    FindTableSchemas: findTableSchemasTool,
    ViewTables: viewTablesTool,
    FindSemanticColumns: findSemanticColumnsTool,
    InspectSemanticData: inspectSemanticDataTool,
    GetCurrentDateTime: getCurrentDatetimeTool,
  },
  defaultOptions: { maxSteps: 12 },
});
