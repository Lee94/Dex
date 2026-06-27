import { VinciViewer } from '@vinci/viewer';
import '@vinci/viewer/viewer.css';
import { useMemo } from 'react';
import type { SqlResult } from '@/types';
import { compileSurface } from '@/vinci/compileSurface';
import { loadVan } from '@/vinci/loadVan';
import styles from './ThreadChart.module.css';

// Kick off the @van/analysis global load as soon as this module loads (idempotent).
void loadVan();

/**
 * A read-only chart embedded in a thread. The visualization sub-agent authored a
 * vinci **surface DSL**; here we compile it against an upstream result's rows
 * (`source`) and render it with vinci's `VinciViewer`. Data is NOT queried —
 * aggregation happens in-browser per the DSL. This is the decoupled successor to the
 * old notebook viz cell: no persistence, no editor, no source picker.
 *
 * Lazy-loaded by its caller (the vinci stack is heavy) — this is the default export.
 */
export default function ThreadChart({
  dsl,
  source,
  label,
}: {
  dsl?: unknown;
  source?: SqlResult;
  label?: string;
}) {
  const dslKey = dsl ? JSON.stringify(dsl) : '';
  const sig = `${source?.columns.join(',') ?? ''}|${source?.rowCount ?? 0}`;
  const compiled = useMemo(() => {
    if (!source || source.columns.length === 0) return null;
    return compileSurface(
      source.columns,
      source.rows,
      dsl as Record<string, unknown> | undefined,
      label || 'data',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, dslKey]);

  if (!source) {
    return <div className={styles.placeholder}>No data is available for this chart.</div>;
  }

  return (
    <div className={styles.chart}>
      {label ? (
        <div className={styles.bar}>
          <span className={styles.label}>{label}</span>
        </div>
      ) : null}
      {compiled?.snapshot ? (
        <div className={styles.surface}>
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
        <div className={styles.placeholder}>
          {compiled?.error
            ? `Couldn’t build this chart from the DSL: ${String((compiled.error as Error)?.message ?? compiled.error)}`
            : 'This result needs a category column and a numeric column to chart.'}
        </div>
      )}
    </div>
  );
}
