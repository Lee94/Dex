import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import { relativeTime } from '@/lib/threads';
import { useT } from '@/i18n';
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
  const t = useT();
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>{t.projects.title}</h1>
            <div className={styles.subtitle}>{t.projects.subtitle}</div>
          </div>
          <Button variant="green" onClick={onNew}>
            <Icon name="plus" size={14} color="currentColor" />
            {t.projects.newProject}
          </Button>
        </div>

        {loading ? (
          <div className={styles.state}>{t.projects.loading}</div>
        ) : error ? (
          <div className={styles.state}>
            <span>{t.projects.loadFailed(error)}</span>
            <Button variant="ghost" onClick={onRetry}>
              {t.common.retry}
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <div className={styles.state}>
            <Icon name="projects" size={26} color="var(--dex-text-faintest)" />
            <span>{t.projects.emptyList}</span>
            <Button variant="green" onClick={onNew}>
              <Icon name="plus" size={14} color="currentColor" />
              {t.projects.newProject}
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
                <div className={styles.cardDesc}>{p.description || t.projects.noDescription}</div>
                <div className={styles.cardFoot}>
                  {t.projects.updated(relativeTime(p.updatedAt))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
