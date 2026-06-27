import { VinciDesigner } from '@vinci/designer';
import '@vinci/designer/designer.css';
import { useEffect, useMemo, useRef } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton } from '@/components/ui';
import { compileSurface } from '@/vinci/compileSurface';
import { snapshotToDsl } from '@/vinci/dsl';
import styles from './notebook.module.css';

/**
 * The full-screen chart **editor** — vinci's `VinciDesigner` in a modal, opened
 * from a viz cell's "Edit" button. The default cell render is a read-only
 * `VinciViewer` (see `VizCell`); the heavy Designer bundle loads only when this
 * modal opens (it's `lazy()`-imported there).
 *
 * The DSL + rows are captured at open so the Designer stays uncontrolled for the
 * session (its `onChange` decompiles back to DSL and persists via `onDslChange`,
 * which must not feed back in and remount it mid-edit).
 */
export default function VizEditorModal({
  columns,
  rows,
  dsl,
  tableName,
  title,
  onDslChange,
  onClose,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  dsl?: Record<string, unknown>;
  /** Names the in-memory table (used by the compute + decompile). */
  tableName: string;
  title?: string;
  onDslChange: (dsl: unknown) => void;
  onClose: () => void;
}) {
  // Snapshot the inputs at mount so persisted edits don't recompile the Designer.
  const initial = useRef({ columns, rows, dsl, tableName });
  const compiled = useMemo(
    () =>
      compileSurface(
        initial.current.columns,
        initial.current.rows,
        initial.current.dsl,
        initial.current.tableName,
      ),
    [],
  );
  const tableRef = useRef(compiled.table);

  // Esc closes the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleChange = (snapshot: unknown) => {
    try {
      // Re-attach the table so snapshotToDsl can resolve origins, then store clean DSL.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const surface = snapshotToDsl({
        ...(snapshot as any),
        table: tableRef.current,
      }) as unknown as Record<string, unknown>;
      delete surface.table; // re-injected from the live result on next compile
      onDslChange(surface);
    } catch {
      /* a transient/invalid intermediate edit — keep the last good DSL */
    }
  };

  return (
    <div className={styles.vizModalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.vizModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.vizModalBar}>
          <Icon name="edit" size={14} color="var(--dex-text-soft)" />
          <span className={styles.vizModalTitle}>{title || 'Edit chart'}</span>
          <span className={styles.vizModalSpacer} />
          <IconButton
            icon="cross"
            size={16}
            color="var(--dex-icon)"
            hover="mid"
            padding={6}
            title="Close (Esc)"
            onClick={onClose}
          />
        </div>
        <div className={styles.vizModalBody}>
          {compiled.snapshot ? (
            <VinciDesigner
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data={compiled.snapshot as any}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              table={compiled.table as any}
              apiService={compiled.api as never}
              supportNoneSortType
              onChange={handleChange}
            />
          ) : (
            <div className={styles.vizPlaceholder}>
              {compiled.error
                ? `Couldn’t build this chart from the DSL: ${String(
                    (compiled.error as Error)?.message ?? compiled.error,
                  )}`
                : 'This result needs a category column and a numeric column to chart.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
