import { VinciViewer } from '@vinci/viewer';
import '@vinci/viewer/viewer.css';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import type { NotebookCell, SqlRunResult } from '@/lib/notebooks';
import { compileSurface } from '@/vinci/compileSurface';
import { loadVan } from '@/vinci/loadVan';
import styles from './notebook.module.css';

// Kick off the @van/analysis global load as soon as a viz cell module loads (idempotent).
void loadVan();

// The editable Designer is heavy and only needed on "Edit" — load it on demand.
const VizEditorModal = lazy(() => import('./VizEditorModal'));

/**
 * A visualization cell. By default it renders **read-only** via vinci's
 * `VinciViewer`; clicking "Edit" opens the full-screen `VinciDesigner`
 * (`VizEditorModal`) where the chart can be reconfigured — edits decompile back to
 * DSL and persist via `onDslChange`.
 *
 * Data is NOT queried here — it reads the rows of an upstream SQL cell (by its
 * `outputName`) and aggregates them in-browser. Pass `editable={false}` (e.g. in a
 * thread) to render the viewer only — no source picker, no Edit affordance.
 *
 * Lazy-loaded by its callers (the vinci/帆软 stack is heavy) — this is the default export.
 */
export default function VizCell({
  cell,
  sourceResult,
  sources,
  onDslChange,
  onSourceChange,
  editable = true,
}: {
  cell: NotebookCell;
  sourceResult?: SqlRunResult;
  /** Output names of SQL cells in this notebook (the source picker's options). */
  sources: string[];
  onDslChange: (dsl: unknown) => void;
  onSourceChange: (outputName: string) => void;
  /** When false, render the viewer only (read-only context, e.g. a thread). */
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  // The viewer recompiles when the source data shape OR the DSL changes, so edits
  // made in the Designer modal show here once it closes. (The viewer has no
  // persist-on-change loop, so remounting freely is safe — unlike the Designer.)
  const dslKey = cell.dsl ? JSON.stringify(cell.dsl) : '';
  const sig = `${cell.sourceOutputName ?? ''}|${sourceResult?.columns.join(',') ?? ''}|${
    sourceResult?.rowCount ?? 0
  }`;
  const compiled = useMemo(() => {
    if (!sourceResult || sourceResult.columns.length === 0) return null;
    return compileSurface(
      sourceResult.columns,
      sourceResult.rows,
      cell.dsl as Record<string, unknown> | undefined,
      cell.outputName || 'data',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, dslKey]);

  const picker = (
    <select
      className={styles.outputName}
      value={cell.sourceOutputName ?? ''}
      onChange={(e) => onSourceChange(e.target.value)}
      title="Which SQL cell's output to chart"
    >
      <option value="">— pick a source —</option>
      {sources.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );

  if (!cell.sourceOutputName) {
    return (
      <div className={styles.vizCell}>
        {editable && <div className={styles.vizBar}>Source: {picker}</div>}
        <div className={styles.vizPlaceholder}>
          {editable
            ? 'Pick an upstream SQL cell output to visualize.'
            : 'No data source is bound to this chart.'}
        </div>
      </div>
    );
  }

  if (!sourceResult) {
    return (
      <div className={styles.vizCell}>
        {editable && <div className={styles.vizBar}>Source: {picker}</div>}
        <div className={styles.vizPlaceholder}>
          Run the “{cell.sourceOutputName}” cell to load data for this chart.
        </div>
      </div>
    );
  }

  const canEdit = editable && Boolean(compiled?.snapshot);

  return (
    <div className={styles.vizCell}>
      <div className={styles.vizBar}>
        {editable ? (
          <>Source: {picker}</>
        ) : (
          <span className={styles.vizSourceLabel}>{cell.sourceOutputName}</span>
        )}
        <span className={styles.vizBarSpacer} />
        {canEdit && (
          <button
            className={styles.vizEditBtn}
            onClick={() => setEditing(true)}
            title="Edit this chart"
          >
            <Icon name="edit" size={12} color="currentColor" />
            Edit
          </button>
        )}
      </div>

      {compiled?.snapshot ? (
        <div className={styles.vizSurface}>
          <VinciViewer
            key={`${sig}|${dslKey}`}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={compiled.snapshot as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            table={compiled.table as any}
            apiService={compiled.api as never}
            supportNoneSortType
          />
        </div>
      ) : (
        <div className={styles.vizPlaceholder}>
          {compiled?.error
            ? `Couldn’t build this chart from the DSL: ${String((compiled.error as Error)?.message ?? compiled.error)}`
            : 'This result needs a category column and a numeric column to chart.'}
        </div>
      )}

      {editing && (
        <Suspense fallback={null}>
          <VizEditorModal
            columns={sourceResult.columns}
            rows={sourceResult.rows}
            dsl={cell.dsl as Record<string, unknown> | undefined}
            tableName={cell.outputName || 'data'}
            title={cell.sourceOutputName}
            onDslChange={onDslChange}
            onClose={() => setEditing(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
