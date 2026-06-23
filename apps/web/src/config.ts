/** App configuration, sourced from Vite env vars (see `.env.example`). */
export const config = {
  /** Base URL of the Mastra dev server (apps/agent). */
  mastraBaseUrl: import.meta.env.VITE_MASTRA_URL ?? 'http://localhost:4111',
} as const;
