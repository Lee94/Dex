import { Outlet } from 'react-router';
import { useNotebooks } from '@/hooks/useNotebooks';
import { NotebooksContext } from '@/contexts/NotebooksContext';

/**
 * Wraps the notebook list + editor routes in a single `useNotebooks` instance
 * (via context), so navigating list↔editor doesn't remount the hook (no list
 * re-fetch, no lost autosave). Renders the matched child via `<Outlet />`.
 */
export function NotebooksLayout() {
  const nb = useNotebooks();
  return (
    <NotebooksContext.Provider value={nb}>
      <Outlet />
    </NotebooksContext.Provider>
  );
}
