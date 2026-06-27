import { useNavigate } from 'react-router';
import { ThreadsList } from '@/components/ThreadsList';
import { useThreadsContext } from '@/contexts/ThreadsContext';

/**
 * The threads list at `/threads`. A thin adapter: pulls threads state from
 * context and turns the list's open/new callbacks into navigations. Creating a
 * thread inserts it optimistically (via `createThread`) and routes to it.
 */
export function ThreadsListRoute() {
  const { threads, listLoading, listError, refreshList, createThread, renameThread, removeThread } =
    useThreadsContext();
  const navigate = useNavigate();

  return (
    <ThreadsList
      threads={threads}
      loading={listLoading}
      error={listError}
      onOpenThread={(id) => navigate(`/threads/${id}`)}
      onNewThread={() => navigate(`/threads/${createThread()}`)}
      onRetry={refreshList}
      onRename={renameThread}
      onDelete={removeThread}
    />
  );
}
