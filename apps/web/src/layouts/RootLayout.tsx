import { Outlet } from '@tanstack/react-router';
import { useThreads } from '@/hooks/useThreads';
import { ThreadsContext } from '@/contexts/ThreadsContext';
import { useProjects } from '@/hooks/useProjects';
import { ProjectsContext } from '@/contexts/ProjectsContext';

/**
 * App root layout. Mounts `useThreads` + `useProjects` once for the whole session
 * and provides them via context, so threads state + in-flight streams (and the
 * project list) persist across every route — including the full-screen
 * `/threads/:id` view, which renders outside the Shell. Renders nothing itself but
 * the routed `<Outlet />`.
 */
export function RootLayout() {
  const threads = useThreads();
  const projects = useProjects();
  return (
    <ThreadsContext.Provider value={threads}>
      <ProjectsContext.Provider value={projects}>
        <Outlet />
      </ProjectsContext.Provider>
    </ThreadsContext.Provider>
  );
}
