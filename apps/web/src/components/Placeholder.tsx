import { Icon } from '@/lib/icons';
import styles from './Placeholder.module.css';

/** Blueprint-style NonIdealState used for the not-yet-built views. */
export function Placeholder({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className={styles.root}>
      <div className={styles.icon}>
        <Icon name={icon} size={26} color="var(--dex-text-faint)" />
      </div>
      <div className={styles.title}>{title}</div>
      <div className={styles.subtitle}>{subtitle}</div>
    </div>
  );
}
