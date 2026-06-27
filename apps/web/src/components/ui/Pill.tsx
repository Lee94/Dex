import type { ReactNode } from 'react';
import styles from './ui.module.css';

export function Pill({
  tone = 'success',
  children,
}: {
  tone?: 'success' | 'beta' | 'endorsed' | 'danger' | 'draft' | 'published';
  children: ReactNode;
}) {
  const toneClass =
    tone === 'beta'
      ? styles.pillBeta
      : tone === 'endorsed'
        ? styles.pillEndorsed
        : tone === 'danger'
          ? styles.pillDanger
          : tone === 'draft'
            ? styles.pillDraft
            : tone === 'published'
              ? styles.pillPublished
              : styles.pillSuccess;
  return <span className={`${styles.pill} ${toneClass}`}>{children}</span>;
}
