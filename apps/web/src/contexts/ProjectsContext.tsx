import { createContext, useContext } from 'react';
import { useProjects } from '@/hooks/useProjects';

/**
 * Projects context (v3.0). Carries the `useProjects` state — the project list +
 * CRUD — mounted once in `RootLayout` (above the router outlet) so the sidebar,
 * the projects pages, and a thread's shared-context lookup all share one list that
 * survives navigation. Consumers derive the *active* project from the URL
 * (`useParams`), not from the hook.
 */
export type ProjectsContextValue = ReturnType<typeof useProjects>;

export const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function useProjectsContext(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjectsContext must be used within RootLayout');
  return ctx;
}
