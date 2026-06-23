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
  listLoading,
  listError,
  onNavigate,
  onNewThread,
  onOpenThread,
  onRetryList,
  onRenameThread,
  onDeleteThread,
}: {
  view: View;
  nav: string;
  otherTitle: string;
  otherIcon: string;
  threads: Thread[];
  listLoading: boolean;
  listError: string | null;
  onNavigate: (view: View, navKey: string, title: string) => void;
  onNewThread: () => void;
  onOpenThread: (id: string) => void;
  onRetryList: () => void;
  onRenameThread: (id: string, title: string) => void;
  onDeleteThread: (id: string) => void;
}) {
  return (
    <div className={styles.shell}>
      <Sidebar
        nav={nav}
        threads={threads}
        onNavigate={onNavigate}
        onNewThread={onNewThread}
        onOpenThread={onOpenThread}
      />
      <div className={styles.main}>
        {view === 'threads' ? (
          <ThreadsList
            threads={threads}
            loading={listLoading}
            error={listError}
            onOpenThread={onOpenThread}
            onNewThread={onNewThread}
            onRetry={onRetryList}
            onRename={onRenameThread}
            onDelete={onDeleteThread}
          />
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
