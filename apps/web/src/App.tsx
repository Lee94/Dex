import { lazy, Suspense, useState } from 'react';
import { Shell } from '@/components/Shell';
import type { View } from '@/components/Sidebar';
import { useThreads } from '@/hooks/useThreads';

// Code-split the thread view (and its chart/result rendering) — loaded only
// when a thread is opened.
const ThreadView = lazy(() =>
  import('@/components/ThreadView').then((m) => ({ default: m.ThreadView })),
);

export default function App() {
  const { threads, activeThread, setActiveId, createThread, sendMessage, stop } = useThreads();

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

  if (view === 'thread' && activeThread) {
    return (
      <Suspense fallback={null}>
        <ThreadView
          thread={activeThread}
          onBack={back}
          onSend={(text) => sendMessage(activeThread.id, text)}
          onStop={stop}
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
      onNavigate={navigate}
      onNewThread={newThread}
      onOpenThread={openThread}
    />
  );
}
