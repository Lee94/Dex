import { lazy, Suspense, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useThreadsContext } from '@/contexts/ThreadsContext';
import { ensureNotebook } from '@/lib/notebooks';

// Code-split the thread view (and its chart/result rendering) — loaded only when
// a thread is opened.
const ThreadView = lazy(() =>
  import('@/components/ThreadView').then((m) => ({ default: m.ThreadView })),
);

/**
 * Full-screen thread surface at `/threads/:id` (no Shell/sidebar). The active
 * thread is derived from the `:id` param against the context's thread list;
 * navigation actions push routes instead of mutating selection state.
 */
export function ThreadRoute() {
  const { id } = useParams<{ id: string }>();
  const { threads, listLoading, loadMessages, sendMessage, stop } = useThreadsContext();
  const navigate = useNavigate();

  const thread = id ? (threads.find((t) => t.id === id) ?? null) : null;

  // Hydrate this thread's history the first time it's opened (the URL drove us
  // here; the old setActiveId side-effect is replaced by this effect).
  useEffect(() => {
    if (!id) return;
    const t = threads.find((x) => x.id === id);
    if (t && !t.messagesLoaded && !t.loadingMessages) void loadMessages(id);
  }, [id, threads, loadMessages]);

  // Unknown id (deleted thread or stale deep link) — once the list has loaded
  // and still doesn't contain it, fall back to the list.
  useEffect(() => {
    if (id && !listLoading && !threads.some((t) => t.id === id)) {
      navigate('/threads', { replace: true });
    }
  }, [id, listLoading, threads, navigate]);

  if (!thread) return null; // list still loading, or redirecting away

  return (
    <Suspense fallback={null}>
      <ThreadView
        thread={thread}
        onBack={() => navigate('/threads')}
        onSend={(text) => sendMessage(thread.id, text)}
        onStop={stop}
        onRetryLoad={() => void loadMessages(thread.id)}
        onOpenNotebook={() => {
          // Open the thread "as a notebook" (Hex-style): the thread's cells live
          // in a notebook whose id IS the threadId. Ensure it exists, then route.
          void (async () => {
            await ensureNotebook(thread.id, thread.title).catch(() => {});
            navigate(`/notebooks/${thread.id}`);
          })();
        }}
      />
    </Suspense>
  );
}
