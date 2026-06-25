import { lazy, Suspense, useState } from 'react';
import { Shell } from '@/components/Shell';
import type { View } from '@/components/Sidebar';
import { useThreads } from '@/hooks/useThreads';
import { ACTIVE_NOTEBOOK_KEY, ensureNotebook } from '@/lib/notebooks';

// Code-split the thread view (and its chart/result rendering) — loaded only
// when a thread is opened.
const ThreadView = lazy(() =>
  import('@/components/ThreadView').then((m) => ({ default: m.ThreadView })),
);

export default function App() {
  const {
    threads,
    activeThread,
    listLoading,
    listError,
    setActiveId,
    refreshList,
    createThread,
    renameThread,
    removeThread,
    sendMessage,
    stop,
  } = useThreads();

  const [view, setView] = useState<View>('threads');
  const [nav, setNav] = useState('threads');
  const [otherTitle, setOtherTitle] = useState('');
  const [otherIcon, setOtherIcon] = useState('home');

  const navigate = (nextView: View, navKey: string, title: string) => {
    setView(nextView);
    setNav(navKey);
    if (nextView === 'other') {
      setOtherTitle(title);
      setOtherIcon(navKey);
    }
  };

  const newThread = () => {
    createThread();
    setView('thread');
    setNav('threads');
  };

  const openThread = (id: string) => {
    setActiveId(id);
    setView('thread');
    setNav('threads');
  };

  const back = () => {
    setView('threads');
    setNav('threads');
  };

  // Open a thread "as a notebook" (Hex-style): the thread's agent-authored cells
  // live in a notebook whose id is the threadId. Ensure it exists, point the
  // notebook view at it, then switch surfaces.
  const openThreadNotebook = async (threadId: string, title: string) => {
    try {
      localStorage.setItem(ACTIVE_NOTEBOOK_KEY, threadId);
    } catch {
      /* storage unavailable — the notebook view will fall back to its list */
    }
    await ensureNotebook(threadId, title).catch(() => {});
    setView('notebook');
    setNav('projects');
  };

  if (view === 'thread' && activeThread) {
    return (
      <Suspense fallback={null}>
        <ThreadView
          thread={activeThread}
          onBack={back}
          onSend={(text) => sendMessage(activeThread.id, text)}
          onStop={stop}
          onRetryLoad={() => openThread(activeThread.id)}
          onOpenNotebook={() => void openThreadNotebook(activeThread.id, activeThread.title)}
        />
      </Suspense>
    );
  }

  return (
    <Shell
      view={view}
      nav={nav}
      otherTitle={otherTitle}
      otherIcon={otherIcon}
      threads={threads}
      listLoading={listLoading}
      listError={listError}
      onNavigate={navigate}
      onNewThread={newThread}
      onOpenThread={openThread}
      onRetryList={refreshList}
      onRenameThread={renameThread}
      onDeleteThread={removeThread}
    />
  );
}
