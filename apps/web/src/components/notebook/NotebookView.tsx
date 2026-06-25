import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import { useNotebooks } from '@/hooks/useNotebooks';
import { Cell } from './Cell';
import { NotebookList } from './NotebookList';
import styles from './notebook.module.css';

/**
 * Notebook surface (v2.0 — NotebookEditor). Switches between the notebook list
 * and the cell editor; drives everything through `useNotebooks` (lazy load,
 * debounced autosave, per-cell run state). Lazy-mounted by `Shell` for the
 * `notebook` view.
 */
export function NotebookView() {
  const nb = useNotebooks();

  if (!nb.activeId) {
    return (
      <NotebookList
        notebooks={nb.notebooks}
        loading={nb.listLoading}
        error={nb.listError}
        onOpen={nb.openNotebook}
        onCreate={nb.createNotebook}
        onRetry={nb.refreshList}
        onDelete={nb.deleteNotebook}
      />
    );
  }

  const notebook = nb.activeNotebook;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <IconButton
          icon="chevronLeft"
          size={17}
          color="var(--dex-text-strong)"
          title="All notebooks"
          hover="strong"
          onClick={nb.backToList}
        />
        {notebook ? (
          <input
            className={styles.titleInput}
            value={notebook.title}
            spellCheck={false}
            onChange={(e) => nb.renameNotebook(e.target.value)}
            aria-label="Notebook title"
          />
        ) : (
          <span className={styles.titleInput}>Notebook</span>
        )}
        <span className={styles.headerSpacer} />
        <span className={`${styles.saveStatus} ${nb.saveError ? styles.saveStatusError : ''}`}>
          {nb.saveError ? 'Couldn’t save' : nb.saving ? 'Saving…' : notebook ? 'Saved' : ''}
        </span>
        {notebook ? (
          <Button variant="green" onClick={() => void nb.runAll()} style={{ gap: 7 }}>
            <Icon name="play" size={12} color="#fff" />
            Run all
          </Button>
        ) : null}
      </div>

      <div className={styles.scroll}>
        {nb.notebookLoading ? (
          <div className={styles.state}>
            <span className={styles.spinner} />
            <span className={styles.stateText}>Loading notebook…</span>
          </div>
        ) : nb.notebookError ? (
          <div className={styles.state}>
            <div className={styles.stateIconWrap}>
              <Icon name="warning" size={20} color="var(--dex-danger)" />
            </div>
            <div className={styles.stateTitle}>Couldn’t load this notebook</div>
            <div className={styles.stateText}>{nb.notebookError}</div>
            <Button variant="ghost" onClick={() => void nb.retryOpen()} style={{ marginTop: 4 }}>
              Retry
            </Button>
          </div>
        ) : notebook ? (
          <div className={styles.page}>
            {notebook.cells.length === 0 ? (
              <div className={styles.editorEmpty}>
                This notebook is empty. Add a SQL cell to get started.
              </div>
            ) : (
              notebook.cells.map((cell, i) => (
                <Cell
                  key={cell.id}
                  cell={cell}
                  index={i}
                  runState={nb.results[cell.id]}
                  canMoveUp={i > 0}
                  canMoveDown={i < notebook.cells.length - 1}
                  onChange={(source) => nb.updateCellSource(cell.id, source)}
                  onOutputNameChange={(name) => nb.updateCellOutputName(cell.id, name)}
                  onRun={() => void nb.runCell(cell)}
                  onDelete={() => nb.deleteCell(cell.id)}
                  onMove={(dir) => nb.moveCell(cell.id, dir)}
                />
              ))
            )}
            <div className={styles.addCellRow}>
              <Button variant="quick" onClick={nb.addCell} style={{ gap: 7 }}>
                <Icon name="plus" size={13} color="var(--dex-icon)" />
                Add SQL cell
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
