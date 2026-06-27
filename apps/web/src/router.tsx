import { createBrowserRouter, Navigate } from 'react-router';
import { RootLayout } from '@/layouts/RootLayout';
import { ShellLayout } from '@/layouts/ShellLayout';
import { ThreadRoute } from '@/routes/ThreadRoute';
import { ThreadsListRoute } from '@/routes/ThreadsListRoute';
import { Placeholder } from '@/components/Placeholder';

const placeholder = (icon: string, title: string) => (
  <Placeholder icon={icon} title={title} subtitle="Nothing here yet." />
);

/**
 * Route table (v3.0). The URL is the single source of truth for navigation:
 * `RootLayout` mounts the threads + projects contexts for the whole tree,
 * `/threads/:id` is full-screen (no Shell), and everything else nests under
 * `ShellLayout` (sidebar + outlet). Heavy surfaces use react-router's route-level
 * `lazy` so their code is split (DataBrowser / project editor / etc.).
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/threads" replace /> },

      // Full-screen thread — outside the Shell (no sidebar).
      { path: 'threads/:id', element: <ThreadRoute /> },

      // Everything else lives inside the Shell (sidebar + main panel).
      {
        element: <ShellLayout />,
        children: [
          { path: 'threads', element: <ThreadsListRoute /> },
          {
            path: 'projects',
            lazy: async () => ({
              Component: (await import('@/routes/ProjectsListRoute')).ProjectsListRoute,
            }),
          },
          {
            path: 'projects/:id',
            lazy: async () => ({
              Component: (await import('@/routes/ProjectRoute')).ProjectRoute,
            }),
          },
          {
            // One route with optional params — keeps DataBrowserView mounted
            // across the connection → table drill-down so its caches/selection
            // survive (sibling routes would remount it and reset the hook).
            path: 'data/:connId?/:table?',
            lazy: async () => ({
              Component: (await import('@/components/data-browser/DataBrowserView'))
                .DataBrowserView,
            }),
          },
          {
            path: 'knowledge',
            lazy: async () => ({
              Component: (await import('@/components/knowledge/KnowledgeView')).KnowledgeView,
            }),
          },
          {
            path: 'tasks',
            lazy: async () => ({
              Component: (await import('@/components/tasks/TasksView')).TasksView,
            }),
          },
          { path: 'home', element: placeholder('home', 'Home') },
          { path: 'applications', element: placeholder('applications', 'Context Studio') },
          { path: 'collections', element: placeholder('collections', 'Collections') },
          { path: 'components', element: placeholder('components', 'Components') },
          { path: 'explorations', element: placeholder('explorations', 'Explorations') },
        ],
      },

      // Unknown path → threads.
      { path: '*', element: <Navigate to="/threads" replace /> },
    ],
  },
]);
