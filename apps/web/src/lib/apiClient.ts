import { config } from '@/config';

/**
 * Shared REST client for the agent's root API routes (mounted at the server
 * root, NOT under `/api` — see apps/agent/src/mastra/server/*). Used by the
 * data-source module (`lib/dataSources.ts`), the projects module
 * (`lib/projects.ts`), tasks, and knowledge: a thin `fetch` wrapper that returns
 * parsed JSON or throws a clean Error carrying the server's `{ error }` message.
 */
const BASE = config.mastraBaseUrl;

/** Error thrown on a non-2xx response. Carries the parsed JSON body (`info`) so
 *  callers can read structured fields (e.g. a model save's `yamlErrors`) beyond
 *  the flat message. Extends Error, so existing `e.message` callers are unaffected. */
export class ApiError extends Error {
  status: number;
  info?: unknown;
  constructor(message: string, status: number, info?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.info = info;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let info: unknown;
    try {
      info = await res.json();
      if (info && typeof info === 'object' && 'error' in info) {
        message = String((info as { error: unknown }).error);
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, info);
  }
  return (await res.json()) as T;
}
