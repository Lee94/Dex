import { Agent } from '@mastra/core/agent';
import { model } from '../model';
import { getActiveProvider } from '../db/queries';
import { listTablesTool } from '../tools/list-tables';
import { describeTableTool } from '../tools/describe-table';
import { listMetricsTool } from '../tools/list-metrics';
import { describeModelTool } from '../tools/describe-model';
import { listDatasourcesTool } from '../tools/list-datasources';
import { getCurrentDatetimeTool } from '../tools/get-current-datetime';

const DIALECT = getActiveProvider() === 'postgres' ? 'PostgreSQL' : 'SQLite';

/**
 * Data-discovery specialist (v1.2), invoked by the main analyst via the
 * `delegate_to_data_discovery` tool (Hex `DelegateToDataDiscoveryAgent`).
 *
 * It owns the read-only discovery tools and produces a compact **discovery
 * brief** — which sources/tables/columns/metrics are relevant, their grain, and
 * how to join them — without writing the final analytical query or answering the
 * user. Keeping discovery in a focused sub-agent keeps the main analyst's context
 * lean and lets it fan out across sources. It is internal: the web never
 * addresses it; only the analyst delegates to it.
 */
export const dataDiscoveryAgent = new Agent({
  id: 'dataDiscovery',
  name: 'Data Discovery',
  instructions: `You are a data-discovery specialist working for a lead data analyst. The warehouse is a ${DIALECT} database with a semantic model (governed metrics + cubes).

Given a discovery task, map the data needed to answer it. Be thorough but fast:
- Use list_datasources to see every source; use list_metrics / describe_model for the governed semantic model; use list_tables / describe_table for raw tables (pass a datasourceId to inspect a non-primary source).
- Prefer endorsed, well-described tables/columns and trusted metrics. Note the grain of each relevant table and the keys to join them on.

Return a CONCISE discovery brief (not prose): the relevant source(s), the specific tables + columns (or semantic metrics/dimensions), their grain, the join path, and any caveat (ambiguous fields, units, status filters). Do NOT write the final analytical SQL and do NOT answer the user's question — just hand back the map the analyst will build on.`,
  model,
  tools: {
    listDatasourcesTool,
    listTablesTool,
    describeTableTool,
    listMetricsTool,
    describeModelTool,
    getCurrentDatetimeTool,
  },
  defaultOptions: { maxSteps: 12 },
});
