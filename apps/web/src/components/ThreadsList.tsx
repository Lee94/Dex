import { Icon } from '@/lib/icons';
import { Avatar, Button } from '@/components/ui';
import type { Thread } from '@/types';
import styles from './ThreadsList.module.css';

export function ThreadsList({
  threads,
  onOpenThread,
  onNewThread,
}: {
  threads: Thread[];
  onOpenThread: (id: string) => void;
  onNewThread: () => void;
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
        </div>

        {threads.map((t) => (
          <div key={t.id} className={styles.row} onClick={() => onOpenThread(t.id)}>
            <div className={styles.rowTitle}>
              <Icon name="threads" size={15} color="var(--dex-accent)" />
              {t.title}
            </div>
            <div className={styles.rowUpdated}>{t.updated}</div>
            <div className={styles.rowCreator}>
              <Avatar initial={t.initial} size={22} fontSize={10} />
              <span className={styles.creatorName}>{t.creator}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
