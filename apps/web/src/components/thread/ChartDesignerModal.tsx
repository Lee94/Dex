import { VinciDesigner } from '@vinci/designer';
// The designer's controls are FineUI (`.x-*`) components from @fx-ui/fine-design;
// their base styles + `--fd-*` tokens live in fine_design.css, which the host must
// load (designer.css only carries tokens + scoped overrides). Order matters: FineUI
// base + the chart/table renderers first, then designer.css last so its overrides win.
import '@fx-ui/fine-design/dist/fine_design.css';
import '@vinci/shared/shared.css';
import '@vinci/viewer/viewer.css';
import '@vinci/designer/designer.css';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Modal } from '@/components/ui';
import { buildVinciTableSnapshot } from '@/vinci/vinciTable';
import { loadVan } from '@/vinci/loadVan';
import { createServerApiService, updateChartSpec, type Row } from '@/lib/charts';
import { useT } from '@/i18n';
import styles from './ChartDesignerModal.module.css';

// The vinci designer renders through the @van/analysis global, same as the viewer.
void loadVan();

/**
 * Full-screen manual chart editor (the merged "edit" entry). Mounts vinci's
 * `VinciDesigner` over the chart's stored **snapshot** (`initialSpec` — the final
 * JSON, no DSL round-trip) + a server-backed compute service (live data). The
 * designer's `onChange` already emits a snapshot, which we store straight to the
 * backend (`PATCH /charts/:id` → `spec`), so an edit survives reloads losslessly —
 * even edits that use features the surface DSL can't express. The same panel also
 * offers an "edit in words" box that re-delegates to the agent (builds a fresh chart).
 *
 * Lazy-loaded by ThreadChart (the designer bundle is heavy). Default export.
 */
export default function ChartDesignerModal({
  chartId,
  label,
  initialSpec,
  columns,
  sampleRows,
  onClose,
  onSaved,
  onAiEdit,
}: {
  chartId: string;
  label?: string;
  /** The current chart snapshot (final JSON) to edit. */
  initialSpec: Record<string, unknown>;
  columns: string[];
  sampleRows: Row[];
  /** Persist + lift the edited snapshot back to the thread viewer on close. */
  onSaved: (spec: Record<string, unknown>) => void;
  onClose: () => void;
  /** Send a natural-language revision to the agent (builds a new chart). */
  onAiEdit?: (instruction: string) => void;
}) {
  const t = useT();
  const [warn, setWarn] = useState(false);
  const [aiText, setAiText] = useState('');
  const latest = useRef<Record<string, unknown>>(initialSpec);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The field schema (vinci `table`) + the live compute service. Built once — the
  // designer owns the edit state and reports changes via onChange.
  const table = useMemo(
    () => buildVinciTableSnapshot(columns, sampleRows, label || 'data'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartId],
  );
  const api = useMemo(() => createServerApiService(chartId), [chartId]);

  const handleChange = useCallback(
    (snap: unknown) => {
      // The designer emits the final snapshot — store it as-is (no DSL conversion).
      const spec = snap as Record<string, unknown>;
      latest.current = spec;
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void updateChartSpec(chartId, spec).catch(() => setWarn(true));
      }, 600);
    },
    [chartId],
  );

  const close = useCallback(() => {
    clearTimeout(timer.current);
    if (dirty.current) {
      void updateChartSpec(chartId, latest.current).catch(() => {});
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
          {/* `VinciDesigner` mounts its own (react-router) MemoryRouter for internal
              panel navigation. The Dex app now routes via TanStack Router, so there's
              no parent react-router instance to clash with — the designer's inner
              router is free-standing and needs no context reset. */}
          <VinciDesigner
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={initialSpec as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            table={table as any}
            apiService={api as never}
            onChange={handleChange}
            supportNoneSortType
          />
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
