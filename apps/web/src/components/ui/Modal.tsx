import { useEffect, type ReactNode } from 'react';
import { Icon } from '@/lib/icons';
import { useT } from '@/i18n';
import styles from './ui.module.css';

/**
 * A generic modal dialog: backdrop + centered panel with a header (title + close)
 * and a scrollable body. Closes on backdrop click or Escape. `size="fullscreen"`
 * uses a near-viewport panel (e.g. the expanded result grid).
 */
export function Modal({
  title,
  onClose,
  children,
  size = 'lg',
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: 'lg' | 'fullscreen';
}) {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={size === 'fullscreen' ? styles.modalPanelFull : styles.modalPanel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{title}</span>
          <button type="button" className={styles.modalClose} title={t.common.close} onClick={onClose}>
            <Icon name="cross" size={15} color="var(--dex-icon)" />
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}
