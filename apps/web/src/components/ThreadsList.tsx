import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '@/lib/icons';
import { Avatar, Button, IconButton } from '@/components/ui';
import type { Thread } from '@/types';
import styles from './ThreadsList.module.css';

export function ThreadsList({
  threads,
  loading,
  error,
  onOpenThread,
  onNewThread,
  onRetry,
  onRename,
  onDelete,
}: {
  threads: Thread[];
  loading: boolean;
  error: string | null;
  onOpenThread: (id: string) => void;
  onNewThread: () => void;
  onRetry: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <div className={styles.icon}>
          <Icon name="threads" size={18} color="var(--dex-accent)" />
        </div>
        <h1 className={styles.title}>Threads</h1>
        <Button variant="green" onClick={onNewThread} style={{ gap: 7 }}>
          <Icon name="plus" size={13} color="#fff" />
          New thread
        </Button>
      </div>

      <div className={styles.body}>
        <div className={styles.colsHead}>
          <div className={styles.colHead} style={{ flex: 1 }}>
            Title
          </div>
          <div className={styles.colHead} style={{ width: 180 }}>
            Last Updated
          </div>
          <div className={styles.colHead} style={{ width: 240 }}>
            Creator
          </div>
          <div style={{ width: 36 }} />
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : threads.length === 0 ? (
          <EmptyState onNewThread={onNewThread} />
        ) : (
          threads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              onOpen={() => onOpenThread(t.id)}
              onRename={(title) => onRename(t.id, title)}
              onDelete={() => onDelete(t.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

type RowMode = 'view' | 'edit' | 'confirm';

function ThreadRow({
  thread,
  onOpen,
  onRename,
  onDelete,
}: {
  thread: Thread;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<RowMode>('view');
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'edit') inputRef.current?.select();
  }, [mode]);

  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== thread.title) onRename(next);
    setMode('view');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(thread.title);
      setMode('view');
    }
  };

  // Confirm-delete row.
  if (mode === 'confirm') {
    return (
      <div className={`${styles.row} ${styles.rowConfirm}`}>
        <span className={styles.confirmText}>
          Delete <strong>“{thread.title}”</strong>? This can’t be undone.
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" onClick={() => setMode('view')}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onDelete}>
          Delete
        </Button>
      </div>
    );
  }

  return (
    <div
      className={styles.row}
      onClick={() => mode === 'view' && onOpen()}
      style={{ cursor: mode === 'view' ? 'pointer' : 'default' }}
    >
      <div className={styles.rowTitle}>
        <Icon name="threads" size={15} color="var(--dex-accent)" />
        {mode === 'edit' ? (
          <input
            ref={inputRef}
            className={styles.renameInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          thread.title
        )}
      </div>
      <div className={styles.rowUpdated}>{thread.updated}</div>
      <div className={styles.rowCreator}>
        <Avatar initial={thread.initial} size={22} fontSize={10} />
        <span className={styles.creatorName}>{thread.creator}</span>
      </div>

      <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
        <IconButton
          icon="more"
          size={15}
          color="var(--dex-icon)"
          title="Thread actions"
          hover="mid"
          padding={6}
          onClick={() => setMenuOpen((o) => !o)}
        />
        {menuOpen ? (
          <>
            <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
            <div className={styles.menu}>
              <button
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  setDraft(thread.title);
                  setMode('edit');
                }}
              >
                <Icon name="bookmark" size={13} color="var(--dex-icon)" />
                Rename
              </button>
              <button
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => {
                  setMenuOpen(false);
                  setMode('confirm');
                }}
              >
                <Icon name="trash" size={13} color="var(--dex-danger)" />
                Delete
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.state}>
      <span className={styles.spinner} />
      <span className={styles.stateText}>Loading threads…</span>
    </div>
  );
}

function EmptyState({ onNewThread }: { onNewThread: () => void }) {
  return (
    <div className={styles.state}>
      <div className={styles.stateIcon}>
        <Icon name="threads" size={22} color="var(--dex-accent)" />
      </div>
      <div className={styles.stateTitle}>No threads yet</div>
      <div className={styles.stateText}>
        Start a thread and ask a question about your data — it’ll be saved here.
      </div>
      <Button variant="green" onClick={onNewThread} style={{ gap: 7, marginTop: 4 }}>
        <Icon name="plus" size={13} color="#fff" />
        New thread
      </Button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.state}>
      <div className={`${styles.stateIcon} ${styles.stateIconError}`}>
        <Icon name="help" size={22} color="var(--dex-danger)" />
      </div>
      <div className={styles.stateTitle}>Couldn’t load threads</div>
      <div className={styles.stateText}>{message}</div>
      <Button variant="ghost" onClick={onRetry} style={{ marginTop: 4 }}>
        Retry
      </Button>
    </div>
  );
}
