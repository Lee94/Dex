import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import { relativeTime } from '@/lib/threads';
import type { Project } from '@/lib/projects';
import styles from './project.module.css';

/**
 * The projects list at `/projects` — a grid of project cards. A project groups
 * threads and carries shared context; opening one shows its detail/editor.
 */
export function ProjectsList({
  projects,
  loading,
  error,
  onOpen,
  onNew,
  onRetry,
}: {
  projects: Project[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRetry: () => void;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>Projects</h1>
            <div className={styles.subtitle}>
              Group related threads and give them shared context.
            </div>
          </div>
          <Button variant="green" onClick={onNew}>
            <Icon name="plus" size={14} color="currentColor" />
            New project
          </Button>
        </div>

        {loading ? (
          <div className={styles.state}>Loading projects…</div>
        ) : error ? (
          <div className={styles.state}>
            <span>Couldn’t load projects. {error}</span>
            <Button variant="ghost" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <div className={styles.state}>
            <Icon name="projects" size={26} color="var(--dex-text-faintest)" />
            <span>No projects yet. Create one to group threads and share context.</span>
            <Button variant="green" onClick={onNew}>
              <Icon name="plus" size={14} color="currentColor" />
              New project
            </Button>
          </div>
        ) : (
          <div className={styles.grid}>
            {projects.map((p) => (
              <button key={p.id} className={styles.card} onClick={() => onOpen(p.id)}>
                <div className={styles.cardTop}>
                  <Icon name="projects" size={15} color="var(--dex-accent)" />
                  <span className={styles.cardName}>{p.name}</span>
                </div>
                <div className={styles.cardDesc}>{p.description || 'No description'}</div>
                <div className={styles.cardFoot}>Updated {relativeTime(p.updatedAt)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
