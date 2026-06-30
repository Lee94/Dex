import { VinciViewer } from '@vinci/viewer';
import '@vinci/viewer/viewer.css';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { toCsv, type SqlResult } from '@/types';
import { buildSnapshot, compileSurface, type CompiledSurface } from '@/vinci/compileSurface';
import { loadVan } from '@/vinci/loadVan';
import { createServerApiService, getChart, getChartRows, type ChartDef } from '@/lib/charts';
import type { PinInput } from '@/lib/reports';
import { useT } from '@/i18n';
import styles from './ThreadChart.module.css';

const ChartDesignerModal = lazy(() => import('./ChartDesignerModal'));

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
  (label || 'chart')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'chart';

/**
 * A chart embedded in a thread. In the live-data redesign a chart is a persisted
 * backend entity addressed by `chartId`: we fetch its DSL + a schema probe, render
 * it with vinci's `VinciViewer`, and feed the viewer a **server-backed** compute
 * service so its aggregation runs as live SQL (no rows cross the wire raw). The
 * single "Edit chart" button opens the full `VinciDesigner` (manual editing, which
 * persists straight back) with an "edit in words" box inside it.
 *
 * Legacy fallback: older threads / pins that captured their DSL + rows inline (before
 * the redesign) pass `dsl` + `source` and render read-only via the in-browser path.
 *
 * Lazy-loaded by its caller (the vinci stack is heavy) — this is the default export.
 */
export default function ThreadChart({
  chartId,
  dsl,
  source,
  label,
  onEdit,
  onPin,
}: {
  /** The persisted chart id (live-data path). */
  chartId?: string;
  /** Legacy inline DSL (pre-redesign threads/pins). */
  dsl?: unknown;
  /** Legacy inline rows (pre-redesign threads/pins). */
  source?: SqlResult;
  label?: string;
  /** Send a natural-language revision back to the agent (rebuilds as a new chart). */
  onEdit?: (instruction: string) => void;
  /** Pin this chart into the thread's report (v3.4). */
  onPin?: (input: PinInput) => void;
}) {
  const t = useT();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [pinned, setPinned] = useState(false);

  // Live chart definition (fetched by id). Null in legacy mode or while loading.
  const [def, setDef] = useState<ChartDef | null>(null);
  const [loading, setLoading] = useState(!!chartId);

  const hasLegacy = !!source && source.columns.length > 0;

  useEffect(() => {
    if (!chartId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    getChart(chartId)
      .then((d) => {
        if (alive) setDef(d);
      })
      .catch(() => {
        // No backend chart for this id (e.g. a pre-redesign thread). The render
        // falls back to the inline DSL + rows if the caller supplied them.
        if (alive) setDef(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chartId]);

  const isLive = !!def && def.columns.length > 0;
  const defDslKey = def ? JSON.stringify(def.dsl ?? null) : '';
  const legacyDslKey = dsl ? JSON.stringify(dsl) : '';
  const legacySig = `${source?.columns.join(',') ?? ''}|${source?.rowCount ?? 0}`;

  const compiled: CompiledSurface | null = useMemo(() => {
    if (isLive && def) {
      const built = buildSnapshot(def.columns, def.sampleRows, def.dsl, label || 'data');
      return { ...built, api: createServerApiService(def.id) };
    }
    if (hasLegacy && source) {
      return compileSurface(
        source.columns,
        source.rows,
        dsl as Record<string, unknown> | undefined,
        label || 'data',
      );
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, def?.id, defDslKey, legacySig, legacyDslKey, label]);

  const exportCsv = async () => {
    if (isLive && def) {
      try {
        const rows = await getChartRows(def.id);
        downloadFile(toCsv(rows), `${safeName(label)}.csv`, 'text/csv;charset=utf-8');
      } catch {
        /* base query unavailable */
      }
      return;
    }
    if (source) downloadFile(toCsv(source), `${safeName(label)}.csv`, 'text/csv;charset=utf-8');
  };
  const exportSvg = () => {
    const svg = surfaceRef.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const doc = xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
    downloadFile(doc, `${safeName(label)}.svg`, 'image/svg+xml;charset=utf-8');
  };

  const doPin = () => {
    if (!onPin) return;
    const payload = isLive && def ? { chartId: def.id, label } : { dsl, source, label };
    onPin({ kind: 'chart', title: label || 'Chart', payload });
    setPinned(true);
    window.setTimeout(() => setPinned(false), 1400);
  };

  if (loading) {
    return <div className={styles.placeholder}>{t.chart.loading}</div>;
  }
  if (!isLive && !hasLegacy) {
    // Either the chart's base query couldn't run (def.error) or there's no chart to
    // show at all (a stale id with no legacy fallback).
    return <div className={styles.placeholder}>{def?.error ?? t.chart.loadFailed}</div>;
  }

  return (
    <div className={styles.chart}>
      <div className={styles.bar}>
        {label ? <span className={styles.label}>{label}</span> : <span className={styles.label} />}
        <span className={styles.barSpacer} />
        {isLive ? (
          <button
            type="button"
            className={`${styles.toolBtn}${editing ? ` ${styles.toolOn}` : ''}`}
            title={t.chart.edit}
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={12} color="var(--dex-icon)" />
            {t.chart.edit}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.toolBtn}
          title={t.chart.exportSvg}
          onClick={exportSvg}
        >
          {t.chart.svg}
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          title={t.chart.exportData}
          onClick={() => void exportCsv()}
        >
          {t.chart.csv}
        </button>
        {onPin ? (
          <button type="button" className={styles.toolBtn} title={t.chart.pin} onClick={doPin}>
            {pinned ? t.chart.pinned : t.chart.pin}
          </button>
        ) : null}
      </div>

      {compiled?.snapshot ? (
        <div className={styles.surface} ref={surfaceRef}>
          <VinciViewer
            key={`${def?.id ?? 'legacy'}|${legacySig}|${defDslKey}|${legacyDslKey}`}
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
            ? t.chart.dslError(String((compiled.error as Error)?.message ?? compiled.error))
            : t.chart.noData}
        </div>
      )}

      {editing && isLive && def ? (
        <Suspense fallback={null}>
          <ChartDesignerModal
            chartId={def.id}
            label={label}
            initialDsl={def.dsl}
            columns={def.columns}
            sampleRows={def.sampleRows}
            onAiEdit={onEdit}
            onSaved={(newDsl) => setDef((prev) => (prev ? { ...prev, dsl: newDsl } : prev))}
            onClose={() => setEditing(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
