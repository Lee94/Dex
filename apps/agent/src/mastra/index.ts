import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

import { analyst } from './agents/analyst';
import { dataDiscoveryAgent } from './agents/discovery';
import { visualizationAgent } from './agents/visualization';
import { semanticModelAgent } from './agents/semantic-model';
import { buildObservability } from './observability';
import { dataSourceRoutes } from './server/routes';
import { knowledgeRoutes } from './server/knowledge-routes';
import { uploadRoutes } from './server/upload-routes';
import { taskRoutes } from './server/task-routes';
import { projectRoutes } from './server/project-routes';
import { startScheduler } from './db/scheduler';

export const mastra = new Mastra({
  // `analyst` is the streamed entry point the web addresses. The v1.2 specialist
  // sub-agents (dataDiscovery / visualization) are registered for full Mastra
  // context (logger/tracing) but are internal — only the analyst delegates to
  // them. `semanticModel` (v3.1) is also web-addressed directly: it backs the
  // data-model editor's assistant panel, separate from the analyst stream.
  agents: {
    analyst,
    dataDiscovery: dataDiscoveryAgent,
    visualization: visualizationAgent,
    semanticModel: semanticModelAgent,
  },
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
    // v0.9 knowledge module: guides / memories / review-requests (see
    // server/knowledge-routes.ts). v3.0 projects module: project CRUD (see
    // server/project-routes.ts). All mount at the server root.
    apiRoutes: [
      ...dataSourceRoutes,
      ...knowledgeRoutes,
      ...uploadRoutes,
      ...taskRoutes,
      ...projectRoutes,
    ],
  },
});

// v1.3 scheduler: an in-process cron loop that re-runs due tasks (read-only) and
// delivers/alerts. Gated by env so tests/CI (which don't import this module)
// never start a background loop; set DEX_SCHEDULER=off to disable in dev too.
if (process.env.DEX_SCHEDULER !== 'off') {
  startScheduler();
}
