import type { ReactNode } from 'react';
import styles from './ui.module.css';

export function Pill({
  tone = 'success',
  children,
}: {
  tone?: 'success' | 'beta' | 'endorsed' | 'danger';
  children: ReactNode;
}) {
  const toneClass =
    tone === 'beta'
      ? styles.pillBeta
      : tone === 'endorsed'
        ? styles.pillEndorsed
        : tone === 'danger'
          ? styles.pillDanger
          : styles.pillSuccess;
  return <span className={`${styles.pill} ${toneClass}`}>{children}</span>;
}
