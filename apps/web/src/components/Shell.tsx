import type { Thread } from '../types';
import { Placeholder } from './Placeholder';
import { Sidebar, type View } from './Sidebar';
import { ThreadsList } from './ThreadsList';

export function Shell({
  view,
  nav,
  otherTitle,
  otherIcon,
  threads,
  onNavigate,
  onNewThread,
  onOpenThread,
}: {
  view: View;
  nav: string;
  otherTitle: string;
  otherIcon: string;
  threads: Thread[];
  onNavigate: (view: View, navKey: string, title: string) => void;
  onNewThread: () => void;
  onOpenThread: (id: string) => void;
}) {
  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: '#f6f7f9' }}>
      <Sidebar nav={nav} onNavigate={onNavigate} onNewThread={onNewThread} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {view === 'threads' ? (
          <ThreadsList threads={threads} onOpenThread={onOpenThread} onNewThread={onNewThread} />
        ) : view === 'notebook' ? (
          <Placeholder icon="projects" title="Projects" subtitle="The notebook editor is coming soon." />
        ) : (
          <Placeholder icon={otherIcon} title={otherTitle || 'Coming soon'} subtitle="Nothing here yet." />
        )}
      </div>
    </div>
  );
}
