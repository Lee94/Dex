import { useEffect, useRef } from 'react';
import { useLoaderData, useNavigate, useParams } from 'react-router';
import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import { Cell } from '@/components/notebook/Cell';
import { useNotebooksContext } from '@/contexts/NotebooksContext';
import type { Notebook } from '@/lib/notebooks';
import styles from '@/components/notebook/notebook.module.css';

/**
 * The notebook editor at `/notebooks/:id`. The routed id drives which notebook
 * is open; the route `loader` (see router.tsx) pre-fetches it so opening is
 * waterfall-free (`openNotebook` reuses the loader payload). Pending edits are
 * flushed when the route unmounts.
 */
export function NotebookEditorRoute() {
  const { id } = useParams<{ id: string }>();
  const initial = useLoaderData() as Notebook | null;
  const nb = useNotebooksContext();
  const navigate = useNavigate();

  const { openNotebook, flushSave, activeId } = nb;

  // Hold the latest loader payload without making it an effect dependency, so a
  // loader revalidation can't re-fire the open (which would flush mid-edit).
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // Open the routed notebook when the id changes — but skip if it's already the
  // active one, so editing never reloads it out from under the user. Pending
  // edits are flushed when the route unmounts.
  useEffect(() => {
    if (id && id !== activeId) void openNotebook(id, initialRef.current ?? undefined);
    return () => flushSave();
  }, [id, activeId, openNotebook, flushSave]);

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
          onClick={() => navigate('/notebooks')}
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
              notebook.cells.map((cell, i) => {
                // viz cell: resolve the upstream SQL cell's latest result by outputName.
                const src =
                  cell.kind === 'viz' && cell.sourceOutputName
                    ? notebook.cells.find(
                        (c) => c.kind === 'sql' && c.outputName === cell.sourceOutputName,
                      )
                    : undefined;
                const sources = notebook.cells
                  .filter((c) => c.kind === 'sql' && c.outputName)
                  .map((c) => c.outputName as string);
                return (
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
                    sourceResult={src ? nb.results[src.id]?.result : undefined}
                    sources={sources}
                    onDslChange={(dsl) => nb.updateCellDsl(cell.id, dsl)}
                    onSourceChange={(name) => nb.updateCellSourceOutputName(cell.id, name)}
                  />
                );
              })
            )}
            <div className={styles.addCellRow}>
              <Button variant="quick" onClick={nb.addCell} style={{ gap: 7 }}>
                <Icon name="plus" size={13} color="var(--dex-icon)" />
                Add SQL cell
              </Button>
              <Button variant="quick" onClick={nb.addVizCell} style={{ gap: 7 }}>
                <Icon name="plus" size={13} color="var(--dex-icon)" />
                Add viz cell
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
