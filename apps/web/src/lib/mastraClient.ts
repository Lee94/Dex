import { MastraClient } from '@mastra/client-js';
import { config } from '@/config';

export const mastra = new MastraClient({ baseUrl: config.mastraBaseUrl });

// The agent is registered under the key `analyst` in apps/agent/src/mastra/index.ts.
export const analystAgent = mastra.getAgent('analyst');
