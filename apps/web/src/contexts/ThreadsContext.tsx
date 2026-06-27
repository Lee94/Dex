import { createContext, useContext } from 'react';
import { useThreads } from '@/hooks/useThreads';

/**
 * Threads context (routing, v3.0). Carries the `useThreads` state — the live
 * thread list **and the in-flight streaming state** — so it survives navigation
 * between `/threads`, `/threads/:id`, and the rest of the app. A stream started
 * on one route keeps writing to its thread while the user moves around, because
 * the hook is mounted once in `RootLayout` (above the router outlet), not per
 * route. Consumers derive the *active* thread from the URL (`useParams`), not
 * from the hook — the URL is the single source of truth for selection.
 */
export type ThreadsContextValue = ReturnType<typeof useThreads>;

export const ThreadsContext = createContext<ThreadsContextValue | null>(null);

export function useThreadsContext(): ThreadsContextValue {
  const ctx = useContext(ThreadsContext);
  if (!ctx) throw new Error('useThreadsContext must be used within RootLayout');
  return ctx;
}
