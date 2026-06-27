import { createContext, useContext } from 'react';
import type { NotebookState } from '@/hooks/useNotebooks';

/**
 * Notebooks context (routing, v3.0). One `useNotebooks` instance is mounted in
 * `NotebooksLayout` and shared by the list (`/notebooks`) and editor
 * (`/notebooks/:id`) routes, so the lazy-loaded list isn't re-fetched on every
 * list↔editor hop and a pending autosave survives the transition. The active
 * notebook is driven by the URL `:id` param, not internal selection state.
 */
export const NotebooksContext = createContext<NotebookState | null>(null);

export function useNotebooksContext(): NotebookState {
  const ctx = useContext(NotebooksContext);
  if (!ctx) throw new Error('useNotebooksContext must be used within NotebooksLayout');
  return ctx;
}
