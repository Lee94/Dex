import { Outlet } from 'react-router';
import { useThreads } from '@/hooks/useThreads';
import { ThreadsContext } from '@/contexts/ThreadsContext';

/**
 * App root layout. Mounts `useThreads` once for the whole session and provides
 * it via context, so threads state + in-flight streams persist across every
 * route (including the full-screen `/threads/:id` view, which renders outside
 * the Shell). Renders nothing itself but the routed `<Outlet />`.
 */
export function RootLayout() {
  const threads = useThreads();
  return (
    <ThreadsContext.Provider value={threads}>
      <Outlet />
    </ThreadsContext.Provider>
  );
}
