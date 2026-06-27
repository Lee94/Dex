import { createBrowserRouter, Navigate, type LoaderFunctionArgs } from 'react-router';
import { RootLayout } from '@/layouts/RootLayout';
import { ShellLayout } from '@/layouts/ShellLayout';
import { NotebooksLayout } from '@/layouts/NotebooksLayout';
import { ThreadRoute } from '@/routes/ThreadRoute';
import { ThreadsListRoute } from '@/routes/ThreadsListRoute';
import { NotebooksListRoute } from '@/routes/NotebooksListRoute';
import { Placeholder } from '@/components/Placeholder';
import { getNotebook, type Notebook } from '@/lib/notebooks';

// Pre-fetch the notebook during navigation so the editor opens without a
// loading-then-data flash. Returns null on failure; the route renders the
// hook's error state in that case.
async function notebookLoader({ params }: LoaderFunctionArgs): Promise<Notebook | null> {
  try {
    return await getNotebook(params.id!);
  } catch {
    return null;
  }
}

const placeholder = (icon: string, title: string) => (
  <Placeholder icon={icon} title={title} subtitle="Nothing here yet." />
);

/**
 * Route table (v3.0). The URL is the single source of truth for navigation:
 * `RootLayout` mounts the threads context for the whole tree, `/threads/:id`
 * is full-screen (no Shell), and everything else nests under `ShellLayout`
 * (sidebar + outlet). Heavy surfaces use react-router's route-level `lazy` so
 * their code is split exactly as before (DataBrowser/Notebook editor/etc.).
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
            path: 'notebooks',
            element: <NotebooksLayout />,
            children: [
              { index: true, element: <NotebooksListRoute /> },
              {
                path: ':id',
                loader: notebookLoader,
                lazy: async () => ({
                  Component: (await import('@/routes/NotebookEditorRoute')).NotebookEditorRoute,
                }),
              },
            ],
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
