import { VinciViewer } from '@vinci/viewer';
import '@vinci/viewer/viewer.css';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '@/lib/icons';
import { toCsv, type SqlResult } from '@/types';
import { compileSurface } from '@/vinci/compileSurface';
import { loadVan } from '@/vinci/loadVan';
import { useT } from '@/i18n';
import styles from './ThreadChart.module.css';

// Kick off the @van/analysis global load as soon as this module loads (idempotent).
void loadVan();

/** Trigger a browser download of `content` as a file. */
function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const safeName = (label?: string) =>
  (label || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';

/**
 * A chart embedded in a thread. The visualization sub-agent authored a vinci
 * **surface DSL**; here we compile it against an upstream result's rows (`source`)
 * and render it with vinci's `VinciViewer`. Data is NOT queried — aggregation
 * happens in-browser per the DSL.
 *
 * v3.3 adds a toolbar: "edit in words" (re-delegates to the agent via `onEdit`,
 * which rebuilds the chart in a follow-up turn) and export (the underlying data as
 * CSV always; the rendered chart as SVG when the viewer drew one).
 *
 * Lazy-loaded by its caller (the vinci stack is heavy) — this is the default export.
 */
export default function ThreadChart({
  dsl,
  source,
  label,
  onEdit,
}: {
  dsl?: unknown;
  source?: SqlResult;
  label?: string;
  /** Send a natural-language revision back to the agent (v3.3). */
  onEdit?: (instruction: string) => void;
}) {
  const t = useT();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState('');

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

  const submitEdit = () => {
    const text = instruction.trim();
    if (!text || !onEdit) return;
    setInstruction('');
    setEditing(false);
    onEdit(t.chart.reviseMessage(label ?? '', text));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitEdit();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  };

  const exportCsv = () => downloadFile(toCsv(source), `${safeName(label)}.csv`, 'text/csv;charset=utf-8');
  const exportSvg = () => {
    const svg = surfaceRef.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const doc = xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
    downloadFile(doc, `${safeName(label)}.svg`, 'image/svg+xml;charset=utf-8');
  };

  return (
    <div className={styles.chart}>
      <div className={styles.bar}>
        {label ? <span className={styles.label}>{label}</span> : <span className={styles.label} />}
        <span className={styles.barSpacer} />
        {onEdit ? (
          <button
            type="button"
            className={`${styles.toolBtn}${editing ? ` ${styles.toolOn}` : ''}`}
            title={t.chart.edit}
            onClick={() => setEditing((e) => !e)}
          >
            <Icon name="edit" size={12} color="var(--dex-icon)" />
            {t.chart.edit}
          </button>
        ) : null}
        <button type="button" className={styles.toolBtn} title={t.chart.exportSvg} onClick={exportSvg}>
          {t.chart.svg}
        </button>
        <button type="button" className={styles.toolBtn} title={t.chart.exportData} onClick={exportCsv}>
          {t.chart.csv}
        </button>
      </div>

      {editing && onEdit ? (
        <div className={styles.editRow}>
          <input
            className={styles.editInput}
            value={instruction}
            autoFocus
            placeholder={t.chart.editPlaceholder}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={onKey}
          />
          <button type="button" className={styles.applyBtn} onClick={submitEdit}>
            {t.chart.apply}
          </button>
        </div>
      ) : null}

      {compiled?.snapshot ? (
        <div className={styles.surface} ref={surfaceRef}>
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
