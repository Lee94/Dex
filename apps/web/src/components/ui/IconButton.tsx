import type { CSSProperties } from 'react';
import { Icon } from '@/lib/icons';
import styles from './ui.module.css';

const HOVER = { strong: styles.hoverStrong, mid: styles.hoverMid, soft: styles.hoverSoft } as const;

export function IconButton({
  icon,
  size = 16,
  color = 'var(--dex-icon)',
  title,
  onClick,
  hover = 'strong',
  padding = 5,
  style,
}: {
  icon: string;
  size?: number;
  color?: string;
  title?: string;
  onClick?: () => void;
  hover?: 'strong' | 'mid' | 'soft';
  padding?: number | string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className={`${styles.iconBtn} ${HOVER[hover]}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{ padding, ...style }}
    >
      <Icon name={icon} size={size} color={color} />
    </button>
  );
}
