import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { useT } from '@/i18n';
import styles from './ui.module.css';

/**
 * A small modal confirmation. `onConfirm` may be async; the dialog shows a busy
 * state and keeps itself open (surfacing the error) if it rejects, otherwise it
 * closes via `onClose`.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className={styles.confirmBackdrop} onClick={onClose}>
      <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.confirmTitle}>{title}</h3>
        <div className={styles.confirmMessage}>{message}</div>
        {error ? <div className={styles.confirmError}>{error}</div> : null}
        <div className={styles.confirmActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={busy}>
            {busy ? t.common.working : (confirmLabel ?? t.common.delete)}
          </Button>
        </div>
      </div>
    </div>
  );
}
