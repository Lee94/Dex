import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton } from '@/components/ui';
import { ResultCard } from '@/components/ResultCard';
import type { NotebookCell } from '@/lib/notebooks';
import type { CellRunState } from '@/hooks/useNotebooks';
import styles from './notebook.module.css';

/**
 * One notebook cell (v2.0). The MVP is a SQL cell: a mono code editor whose
 * "Run" sends the query through the read-only `/query/sql` path and renders the
 * result with the shared `ResultCard` (table or bar chart). ⌘/Ctrl+Enter runs.
 */
export function Cell({
  cell,
  index,
  runState,
  canMoveUp,
  canMoveDown,
  onChange,
  onOutputNameChange,
  onRun,
  onDelete,
  onMove,
}: {
  cell: NotebookCell;
  index: number;
  runState?: CellRunState;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (source: string) => void;
  onOutputNameChange: (outputName: string) => void;
  onRun: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea to fit its content. useLayoutEffect runs before paint
  // so a saved multi-line cell renders at full height with no collapse-then-grow
  // flash on open.
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(resize, [cell.source]);

  const running = runState?.status === 'running';

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun();
    }
  };

  return (
    <div className={styles.cell}>
      <div className={styles.cellToolbar}>
        <span className={styles.cellKind}>SQL</span>
        <span className={styles.cellIndex}>[{index + 1}]</span>
        <button className={styles.runBtn} onClick={onRun} disabled={running} title="Run (⌘↵)">
          <Icon name="play" size={11} color="currentColor" />
          {running ? 'Running…' : 'Run'}
        </button>
        <span className={styles.outputArrow}>→</span>
        <input
          className={styles.outputName}
          value={cell.outputName ?? ''}
          spellCheck={false}
          placeholder="output_name"
          title="Name this cell's output so later cells can chain off it (FROM output_name)"
          onChange={(e) => onOutputNameChange(e.target.value)}
        />
        <span className={styles.cellToolSpacer} />
        <div className={styles.cellActions}>
          <IconButton
            icon="chevronUp"
            size={14}
            color="var(--dex-icon)"
            title="Move up"
            hover="mid"
            padding={5}
            onClick={() => onMove(-1)}
            style={{ opacity: canMoveUp ? 1 : 0.3 }}
          />
          <IconButton
            icon="chevronDown"
            size={14}
            color="var(--dex-icon)"
            title="Move down"
            hover="mid"
            padding={5}
            onClick={() => onMove(1)}
            style={{ opacity: canMoveDown ? 1 : 0.3 }}
          />
          <IconButton
            icon="trash"
            size={14}
            color="var(--dex-icon)"
            title="Delete cell"
            hover="mid"
            padding={5}
            onClick={onDelete}
          />
        </div>
      </div>

      <div className={styles.editorArea}>
        <div className={styles.gutter}>{index + 1}</div>
        <textarea
          ref={ref}
          className={styles.textarea}
          value={cell.source}
          spellCheck={false}
          placeholder="SELECT … — write a read-only query"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
        />
      </div>

      {runState && runState.status !== 'idle' ? (
        <div className={styles.output}>
          {runState.status === 'running' ? (
            <div className={styles.outputState}>
              <span className={styles.miniSpinner} />
              Running query…
            </div>
          ) : runState.status === 'error' ? (
            <div className={styles.outputError}>
              <Icon
                name="warning"
                size={14}
                color="var(--dex-danger)"
                style={{ flex: 'none', marginTop: 1 }}
              />
              <span>{runState.errorText || 'Query failed.'}</span>
            </div>
          ) : runState.result ? (
            <ResultCard result={runState.result} sql={cell.source} title={cell.outputName} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
