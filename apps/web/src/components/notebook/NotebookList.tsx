import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton, ConfirmDialog } from '@/components/ui';
import { relativeTime, type NotebookSummary } from '@/lib/notebooks';
import styles from './notebook.module.css';

/** The notebook list (the "Projects" surface) — open / create / delete. */
export function NotebookList({
  notebooks,
  loading,
  error,
  onOpen,
  onCreate,
  onRetry,
  onDelete,
}: {
  notebooks: NotebookSummary[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRetry: () => void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState<NotebookSummary | null>(null);

  return (
    <div className={styles.list}>
      <div className={styles.listHead}>
        <div className={styles.listIconWrap}>
          <Icon name="projects" size={17} color="var(--dex-accent)" />
        </div>
        <h1 className={styles.listTitle}>Notebooks</h1>
        <Button variant="green" onClick={onCreate} style={{ gap: 7 }}>
          <Icon name="plus" size={13} color="#fff" />
          New notebook
        </Button>
      </div>

      <div className={styles.listBody}>
        <div className={styles.colsHead}>
          <div style={{ flex: 1 }}>Title</div>
          <div style={{ width: 150 }}>Last updated</div>
          <div style={{ width: 90 }}>Cells</div>
          <div style={{ width: 32 }} />
        </div>

        {loading ? (
          <div className={styles.state}>
            <span className={styles.spinner} />
            <span className={styles.stateText}>Loading notebooks…</span>
          </div>
        ) : error ? (
          <div className={styles.state}>
            <div className={styles.stateIconWrap}>
              <Icon name="warning" size={20} color="var(--dex-danger)" />
            </div>
            <div className={styles.stateTitle}>Couldn’t load notebooks</div>
            <div className={styles.stateText}>{error}</div>
            <Button variant="ghost" onClick={onRetry} style={{ marginTop: 4 }}>
              Retry
            </Button>
          </div>
        ) : notebooks.length === 0 ? (
          <div className={styles.state}>
            <div className={styles.stateIconWrap}>
              <Icon name="projects" size={20} color="var(--dex-accent)" />
            </div>
            <div className={styles.stateTitle}>No notebooks yet</div>
            <div className={styles.stateText}>
              Create a notebook and build an analysis from re-runnable SQL cells.
            </div>
            <Button variant="green" onClick={onCreate} style={{ gap: 7, marginTop: 4 }}>
              <Icon name="plus" size={13} color="#fff" />
              New notebook
            </Button>
          </div>
        ) : (
          notebooks.map((n) => (
            <div key={n.id} className={styles.row} onClick={() => onOpen(n.id)}>
              <div className={styles.rowTitle}>
                <Icon name="projects" size={15} color="var(--dex-accent)" />
                <span className={styles.rowTitleText}>{n.title}</span>
              </div>
              <div className={styles.rowMeta}>{relativeTime(n.updatedAt)}</div>
              <div className={styles.rowCount}>
                {n.cellCount} {n.cellCount === 1 ? 'cell' : 'cells'}
              </div>
              <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                <IconButton
                  icon="trash"
                  size={15}
                  color="var(--dex-icon)"
                  title="Delete notebook"
                  hover="mid"
                  padding={6}
                  onClick={() => setConfirming(n)}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {confirming ? (
        <ConfirmDialog
          title="Delete notebook"
          message={
            <>
              Delete <strong>{confirming.title}</strong>? This can’t be undone.
            </>
          }
          confirmLabel="Delete notebook"
          onConfirm={() => onDelete(confirming.id)}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}
