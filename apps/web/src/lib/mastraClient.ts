import { MastraClient } from '@mastra/client-js';

// The Mastra dev server (apps/agent) runs on :4111 by default.
const baseUrl = (import.meta.env.VITE_MASTRA_URL as string | undefined) ?? 'http://localhost:4111';

export const mastra = new MastraClient({ baseUrl });

// The agent is registered under the key `analyst` in apps/agent/src/mastra/index.ts.
export const analystAgent = mastra.getAgent('analyst');
