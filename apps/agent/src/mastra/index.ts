import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

import { analyst } from './agents/analyst';

export const mastra = new Mastra({
  agents: { analyst },
  // Mastra's own storage (conversation history / telemetry). This is a separate
  // file from the sample warehouse the analyst queries.
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  // Default CORS is already permissive ('*'), so the Vite web app can call the
  // dev server. Pin it explicitly here for clarity during local development.
  server: {
    cors: {
      origin: '*',
      credentials: false,
    },
  },
});
