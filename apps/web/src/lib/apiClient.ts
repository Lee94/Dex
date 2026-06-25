import { config } from '@/config';

/**
 * Shared REST client for the agent's root API routes (mounted at the server
 * root, NOT under `/api` — see apps/agent/src/mastra/server/*). Used by the
 * data-source module (`lib/dataSources.ts`) and the notebook module
 * (`lib/notebooks.ts`): a thin `fetch` wrapper that returns parsed JSON or
 * throws a clean Error carrying the server's `{ error }` message.
 */
const BASE = config.mastraBaseUrl;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
