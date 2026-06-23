import styles from './ui.module.css';

export function Avatar({
  initial,
  bg = 'var(--dex-avatar-bg)',
  size = 22,
  fontSize = 10,
}: {
  initial: string;
  bg?: string;
  size?: number;
  fontSize?: number;
}) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, background: bg, fontSize }}>
      {initial}
    </span>
  );
}
