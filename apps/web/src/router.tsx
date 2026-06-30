import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  Navigate,
} from '@tanstack/react-router';
import { RootLayout } from '@/layouts/RootLayout';
import { ShellLayout } from '@/layouts/ShellLayout';
import { ThreadRoute } from '@/routes/ThreadRoute';
import { ThreadsListRoute } from '@/routes/ThreadsListRoute';
import { RoutePlaceholder } from '@/components/RoutePlaceholder';

/**
 * Route table (v3.0; migrated to TanStack Router). The URL is the single source of
 * truth for navigation: `RootLayout` mounts the threads + projects contexts for the
 * whole tree, `/threads/:id` is full-screen (no Shell), and everything else nests
 * under a pathless `ShellLayout` (sidebar + outlet). Heavy surfaces use
 * `lazyRouteComponent` so their code is split (DataBrowser / project editor / etc.).
 *
 * `Register` (bottom) wires the router's type into the module, so `navigate`/`Link`
 * `to` targets, path params and search are all checked at compile time.
 */

const rootRoute = createRootRoute({ component: RootLayout });

// `/` → `/threads` (redirect during route loading, before any render).
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/threads' });
  },
});

// Full-screen thread — outside the Shell (no sidebar).
const threadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'threads/$id',
  component: ThreadRoute,
});

// Full-screen, read-only report (pinned results/charts) — outside the Shell.
// Code-split: pulls in the vinci chart stack only when a report is opened.
const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'reports/$threadId',
  component: lazyRouteComponent(() => import('@/routes/ReportRoute'), 'ReportRoute'),
});

// Full-screen semantic-model studio — outside the Shell (no sidebar).
// Entry routes carry the file to open via search: `?new=1` / `?open=<modelId>`.
// Code-split: it pulls in Monaco, loaded only when the editor is opened.
const modelStudioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'data/models/$projectId',
  validateSearch: (search: Record<string, unknown>): { open?: string; new?: boolean } => ({
    open: typeof search.open === 'string' ? search.open : undefined,
    new: search.new === '1' || search.new === true,
  }),
  component: lazyRouteComponent(() => import('@/routes/ModelStudioRoute'), 'ModelStudioRoute'),
});

// Everything else lives inside the Shell (sidebar + main panel). Pathless layout
// route: its children render into the Shell's <Outlet />.
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: ShellLayout,
});

const threadsListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'threads',
  component: ThreadsListRoute,
});

const projectsListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'projects',
  component: lazyRouteComponent(() => import('@/routes/ProjectsListRoute'), 'ProjectsListRoute'),
});

const projectRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'projects/$id',
  component: lazyRouteComponent(() => import('@/routes/ProjectRoute'), 'ProjectRoute'),
});

// One route with optional params — keeps DataBrowserView mounted across the
// connection → table drill-down so its caches/selection survive (sibling routes
// would remount it and reset the hook). `?tab=datamodels` restores the Data Models
// tab when returning from the full-screen model studio.
const dataRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'data/{-$connId}/{-$table}',
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
  component: lazyRouteComponent(
    () => import('@/components/data-browser/DataBrowserView'),
    'DataBrowserView',
  ),
});

const knowledgeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'knowledge',
  component: lazyRouteComponent(
    () => import('@/components/knowledge/KnowledgeView'),
    'KnowledgeView',
  ),
});

const tasksRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'tasks',
  component: lazyRouteComponent(() => import('@/components/tasks/TasksView'), 'TasksView'),
});

// Placeholder routes for the unbuilt nav items.
const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'home',
  component: () => <RoutePlaceholder icon="home" tkey="home" />,
});
const applicationsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'applications',
  component: () => <RoutePlaceholder icon="applications" tkey="contextStudio" />,
});
const collectionsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'collections',
  component: () => <RoutePlaceholder icon="collections" tkey="collections" />,
});
const componentsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'components',
  component: () => <RoutePlaceholder icon="components" tkey="components" />,
});
const explorationsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'explorations',
  component: () => <RoutePlaceholder icon="explorations" tkey="explorations" />,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  threadRoute,
  reportRoute,
  modelStudioRoute,
  shellRoute.addChildren([
    threadsListRoute,
    projectsListRoute,
    projectRoute,
    dataRoute,
    knowledgeRoute,
    tasksRoute,
    homeRoute,
    applicationsRoute,
    collectionsRoute,
    componentsRoute,
    explorationsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  // Unknown path → threads.
  defaultNotFoundComponent: () => <Navigate to="/threads" />,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
