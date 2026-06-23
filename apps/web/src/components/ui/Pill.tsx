import type { ReactNode } from 'react';
import styles from './ui.module.css';

export function Pill({
  tone = 'success',
  children,
}: {
  tone?: 'success' | 'beta';
  children: ReactNode;
}) {
  const toneClass = tone === 'beta' ? styles.pillBeta : styles.pillSuccess;
  return <span className={`${styles.pill} ${toneClass}`}>{children}</span>;
}
