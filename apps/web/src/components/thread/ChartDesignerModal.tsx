import { VinciDesigner } from '@vinci/designer';
import '@vinci/designer/designer.css';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Modal } from '@/components/ui';
import { buildSnapshot } from '@/vinci/compileSurface';
import { snapshotToDsl } from '@/vinci/dsl';
import { loadVan } from '@/vinci/loadVan';
import { createServerApiService, updateChartDsl, type Row } from '@/lib/charts';
import { useT } from '@/i18n';
import styles from './ChartDesignerModal.module.css';

// The vinci designer renders through the @van/analysis global, same as the viewer.
void loadVan();

/**
 * Full-screen manual chart editor (the merged "edit" entry). Mounts vinci's
 * `VinciDesigner` over the chart's compiled snapshot + a server-backed compute
 * service (live data). Every edit is decompiled back to a surface DSL and persisted
 * to the backend (`PATCH /charts/:id`), so a manual edit survives reloads with no
 * conversation rewriting. The same panel also offers an "edit in words" box that
 * re-delegates to the agent (which builds a fresh chart) — both paths in one place.
 *
 * Lazy-loaded by ThreadChart (the designer bundle is heavy). Default export.
 */
export default function ChartDesignerModal({
  chartId,
  label,
  initialDsl,
  columns,
  sampleRows,
  onClose,
  onSaved,
  onAiEdit,
}: {
  chartId: string;
  label?: string;
  initialDsl?: Record<string, unknown>;
  columns: string[];
  sampleRows: Row[];
  /** Persist + lift the edited DSL back to the thread viewer on close. */
  onSaved: (dsl: Record<string, unknown>) => void;
  onClose: () => void;
  /** Send a natural-language revision to the agent (builds a new chart). */
  onAiEdit?: (instruction: string) => void;
}) {
  const t = useT();
  const [warn, setWarn] = useState(false);
  const [aiText, setAiText] = useState('');
  const latest = useRef<Record<string, unknown> | undefined>(initialDsl);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Build the model once from the incoming DSL; the designer then owns the edit
  // state and reports changes via onChange (re-feeding `data` would reset it).
  const compiled = useMemo(
    () => buildSnapshot(columns, sampleRows, initialDsl, label || 'data'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartId],
  );
  const api = useMemo(() => createServerApiService(chartId), [chartId]);

  const handleChange = useCallback(
    (snap: unknown) => {
      let next: Record<string, unknown>;
      try {
        // Decompile the edited vinci snapshot back to a surface DSL. Out-of-scope
        // edits (features beyond the v1 surface DSL) throw — keep the last good DSL.
        next = snapshotToDsl(snap as never) as unknown as Record<string, unknown>;
      } catch {
        setWarn(true);
        return;
      }
      setWarn(false);
      latest.current = next;
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void updateChartDsl(chartId, next).catch(() => {});
      }, 600);
    },
    [chartId],
  );

  const close = useCallback(() => {
    clearTimeout(timer.current);
    if (dirty.current && latest.current) {
      void updateChartDsl(chartId, latest.current).catch(() => {});
      onSaved(latest.current);
    }
    onClose();
  }, [chartId, onClose, onSaved]);

  // Belt-and-suspenders: never leave the debounce running past unmount (an orphaned
  // PATCH could otherwise race the agent's rebuild on the same chart id).
  useEffect(() => () => clearTimeout(timer.current), []);

  const submitAi = () => {
    const text = aiText.trim();
    if (!text || !onAiEdit) return;
    // An AI rebuild supersedes any pending manual edit — drop the debounce, don't flush.
    clearTimeout(timer.current);
    onAiEdit(t.chart.reviseMessage(label ?? '', text));
    onClose();
  };
  const onAiKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitAi();
    }
  };

  return (
    <Modal title={t.chart.designerTitle(label ?? '')} size="fullscreen" onClose={close}>
      <div className={styles.body}>
        {warn ? <div className={styles.warn}>{t.chart.persistError}</div> : null}
        <div className={styles.surface}>
          {compiled.snapshot ? (
            <VinciDesigner
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data={compiled.snapshot as any}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              table={compiled.table as any}
              apiService={api as never}
              onChange={handleChange}
              supportNoneSortType
            />
          ) : (
            <div className={styles.placeholder}>
              {compiled.error
                ? t.chart.dslError(String((compiled.error as Error)?.message ?? compiled.error))
                : t.chart.noData}
            </div>
          )}
        </div>

        {onAiEdit ? (
          <div className={styles.aiRow}>
            <span className={styles.aiHint}>{t.chart.aiHint}</span>
            <input
              className={styles.aiInput}
              value={aiText}
              placeholder={t.chart.editPlaceholder}
              onChange={(e) => setAiText(e.target.value)}
              onKeyDown={onAiKey}
            />
            <button
              type="button"
              className={styles.aiBtn}
              onClick={submitAi}
              disabled={!aiText.trim()}
            >
              {t.chart.apply}
            </button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
