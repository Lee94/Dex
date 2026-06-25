import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

import { analyst } from './agents/analyst';
import { dataDiscoveryAgent } from './agents/discovery';
import { visualizationAgent } from './agents/visualization';
import { buildObservability } from './observability';
import { dataSourceRoutes } from './server/routes';
import { notebookRoutes } from './server/notebook-routes';
import { knowledgeRoutes } from './server/knowledge-routes';
import { uploadRoutes } from './server/upload-routes';

export const mastra = new Mastra({
  // `analyst` is the streamed entry point the web addresses. The v1.2 specialist
  // sub-agents are registered so they get full Mastra context (logger/tracing),
  // but they are internal — the web never addresses them; only the analyst
  // delegates to them via its delegation tools.
  agents: { analyst, dataDiscovery: dataDiscoveryAgent, visualization: visualizationAgent },
  // Mastra's own storage (conversation history / telemetry). This is a separate
  // file from the sample warehouse the analyst queries.
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: (process.env.LOG_LEVEL?.trim() as 'debug' | 'info' | 'warn' | 'error') || 'info',
  }),
  // AI tracing: every agent run / tool call / model interaction becomes a span,
  // exported to mastra.db (browsable in Mastra Studio) and the terminal. Returns
  // undefined when DEX_OBSERVABILITY=off. See observability.ts.
  observability: buildObservability(),
  // Default CORS is already permissive ('*'), so the Vite web app can call the
  // dev server. Pin it explicitly here for clarity during local development.
  server: {
    cors: {
      origin: '*',
      credentials: false,
    },
    // v0.6 data-source module: read-only catalog browsing, metadata curation,
    // and connection management — independent of the agent (see server/routes.ts).
    // v2.0 notebook module: notebook CRUD + a read-only /query/sql cell-execution
    // path (see server/notebook-routes.ts). v0.9 knowledge module: guides /
    // memories / review-requests (see server/knowledge-routes.ts). All mount at
    // the server root.
    apiRoutes: [...dataSourceRoutes, ...notebookRoutes, ...knowledgeRoutes, ...uploadRoutes],
  },
});
