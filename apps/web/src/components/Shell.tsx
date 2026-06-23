import type { Thread } from '@/types';
import { Placeholder } from '@/components/Placeholder';
import { Sidebar, type View } from '@/components/Sidebar';
import { ThreadsList } from '@/components/ThreadsList';
import styles from './Shell.module.css';

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
    <div className={styles.shell}>
      <Sidebar nav={nav} onNavigate={onNavigate} onNewThread={onNewThread} />
      <div className={styles.main}>
        {view === 'threads' ? (
          <ThreadsList threads={threads} onOpenThread={onOpenThread} onNewThread={onNewThread} />
        ) : view === 'notebook' ? (
          <Placeholder
            icon="projects"
            title="Projects"
            subtitle="The notebook editor is coming soon."
          />
        ) : (
          <Placeholder
            icon={otherIcon}
            title={otherTitle || 'Coming soon'}
            subtitle="Nothing here yet."
          />
        )}
      </div>
    </div>
  );
}
