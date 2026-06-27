import { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Pill, ConfirmDialog } from '@/components/ui';
import { useT } from '@/i18n';
import {
  fetchSemanticModel,
  type CreateModelInput,
  type CubeDef,
  type DimensionKind,
  type MeasureKind,
  type ModelStatus,
  type UpdateModelPatch,
} from '@/lib/dataSources';
import type { DataBrowserState } from '@/hooks/useDataBrowser';
import { ApiError } from '@/lib/apiClient';
import styles from '../dataBrowser.module.css';
import { ModelGuiForm } from './ModelGuiForm';
import { ModelYamlEditor, type YamlMarker } from './ModelYamlEditor';
import { ModelAssistantPanel } from './ModelAssistantPanel';
import { emptyGuiDraft, MEASURE_KINDS, type GuiModelDraft } from './guiDraft';

type ActiveSource = 'gui' | 'yaml';

/** GUI draft → the create/patch definition fields the backend expects. */
function guiToInput(draft: GuiModelDraft) {
  const measures = draft.measures
    .map((m) => ({ ...m, name: m.name.trim() }))
    .filter((m) => m.name)
    .map((m) => ({
      name: m.name,
      type: m.type,
      column: m.type === 'count' ? undefined : m.column || undefined,
    }));
  return {
    name: draft.name.trim(),
    title: draft.title.trim() || undefined,
    description: draft.description.trim() || undefined,
    table: draft.table,
    measures,
    dimensions: Object.entries(draft.dims).map(([column, type]) => ({
      name: column,
      column,
      type,
    })),
  };
}

/** Rebuild a GUI draft from a raw cube (edit mode). Best-effort: ratio / complex
 *  measures whose column can't be parsed land with an empty column (edit those in
 *  the YAML tab). */
function cubeToGui(cube: CubeDef): GuiModelDraft {
  const single = new RegExp(`^${cube.name}\\.([A-Za-z_][A-Za-z0-9_]*)$`);
  const parseCol = (sql?: string) => {
    if (!sql) return '';
    const m = single.exec(sql.trim());
    return m ? m[1] : '';
  };
  return {
    name: cube.name,
    title: cube.title ?? '',
    description: cube.description ?? '',
    table: cube.sql,
    measures: cube.measures.map((m) => ({
      name: m.name,
      type: (MEASURE_KINDS as string[]).includes(m.type) ? (m.type as MeasureKind) : 'count',
      column: parseCol(m.sql),
    })),
    dims: Object.fromEntries(
      cube.dimensions.map((d) => [parseCol(d.sql) || d.name, d.type as DimensionKind]),
    ),
  };
}

function StatusPill({ status }: { status: ModelStatus }) {
  const t = useT();
  if (status === 'published') return <Pill tone="published">{t.modelEditor.published}</Pill>;
  if (status === 'draft_pending') return <Pill tone="draft">{t.modelEditor.draftPending}</Pill>;
  return <Pill tone="draft">{t.modelEditor.draft}</Pill>;
}

/**
 * Full-width, two-pane data-model editor (v3.1): GUI / YAML editing on the left,
 * an assistant panel on the right, with draft/publish lifecycle in the toolbar.
 * Entered via `db.openEditor`; the editor owns all working state (only persisted
 * results + the open target live in the hook).
 */
export function ModelEditor({ db }: { db: DataBrowserState }) {
  const t = useT();
  const target = db.editorModel!; // non-null while this view is rendered
  const isNew = target.mode === 'new';
  const projectId = db.projectDetail?.id ?? 'dex';

  const [loading, setLoading] = useState(!isNew);
  const [builtin, setBuiltin] = useState(false);
  const [modelId, setModelId] = useState<string | null>(isNew ? null : target.modelId);
  const [status, setStatus] = useState<ModelStatus>('draft');
  const [activeSource, setActiveSource] = useState<ActiveSource>(isNew ? 'gui' : 'yaml');
  const [gui, setGui] = useState<GuiModelDraft>(emptyGuiDraft());
  const [yamlText, setYamlText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'discard'>(null);
  const [error, setError] = useState<string | null>(null);
  const [yamlMarkers, setYamlMarkers] = useState<YamlMarker[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Edit mode: load the model (raw cube → GUI draft + YAML + status).
  useEffect(() => {
    if (isNew) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const m = await fetchSemanticModel(projectId, target.mode === 'edit' ? target.modelId : '');
        if (!alive) return;
        setBuiltin(!!m.builtin);
        setStatus(m.status ?? 'published');
        setModelId(m.id);
        if (m.cube) setGui(cubeToGui(m.cube));
        if (m.yaml) setYamlText(m.yaml);
        setDirty(false);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isNew, target, projectId]);

  const onGui = (next: GuiModelDraft) => {
    setGui(next);
    setDirty(true);
  };
  const onYaml = (next: string) => {
    setYamlText(next);
    setDirty(true);
    if (yamlMarkers.length) setYamlMarkers([]); // editing clears stale error markers
    if (error) setError(null);
  };

  const buildInput = (publish: boolean): CreateModelInput =>
    activeSource === 'yaml'
      ? { source: 'yaml', yaml: yamlText, publish }
      : { source: 'gui', ...guiToInput(gui), publish };

  const buildPatch = (): UpdateModelPatch =>
    activeSource === 'yaml'
      ? { source: 'yaml', yaml: yamlText }
      : { source: 'gui', ...guiToInput(gui) };

  const save = async (action: 'save' | 'publish') => {
    setError(null);
    setYamlMarkers([]);
    setBusy(action);
    try {
      if (modelId == null) {
        const created = await db.createModel(buildInput(action === 'publish'));
        setDirty(false);
        // Switch to edit mode so subsequent saves PATCH the same model.
        db.openEditor({ mode: 'edit', modelId: created.id });
      } else {
        const updated =
          action === 'publish'
            ? await db.publishModel(modelId, buildPatch())
            : await db.saveModelDraft(modelId, buildPatch());
        setDirty(false);
        if (updated) {
          setStatus(updated.status ?? 'published');
          if (updated.id !== modelId) db.openEditor({ mode: 'edit', modelId: updated.id });
          else setModelId(updated.id);
        }
      }
    } catch (e) {
      // Surface structured YAML errors as inline Monaco markers on the YAML tab.
      const info = e instanceof ApiError ? (e.info as { yamlErrors?: YamlMarker[] }) : undefined;
      if (info?.yamlErrors?.length) {
        setYamlMarkers(info.yamlErrors);
        setActiveSource('yaml');
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (modelId == null) {
      db.closeEditor();
      return;
    }
    setBusy('discard');
    setError(null);
    try {
      await db.discardDraft(modelId);
      db.closeEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const back = () => (dirty ? setConfirmLeave(true) : db.closeEditor());
  const canEdit = !builtin;

  return (
    <div className={styles.meWrap}>
      <div className={styles.meEditCol}>
        <div className={styles.meToolbar}>
          <button type="button" className={styles.crumb} onClick={back}>
            <Icon name="chevronLeft" size={13} color="var(--dex-icon)" /> {t.modelEditor.back}
          </button>
          <span className={styles.meTitle}>
            {isNew ? t.modelEditor.newTitle : t.modelEditor.editTitle}
          </span>
          {!isNew && !loading ? <StatusPill status={status} /> : null}
          <div className={styles.meActions}>
            {status === 'draft_pending' && canEdit ? (
              <Button variant="ghost" onClick={() => void discard()} disabled={!!busy}>
                {t.modelEditor.discard}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => void save('save')} disabled={!canEdit || !!busy}>
              {busy === 'save' ? t.modelEditor.saving : t.modelEditor.saveDraft}
            </Button>
            <Button
              variant="green"
              onClick={() => void save('publish')}
              disabled={!canEdit || !!busy}
            >
              {busy === 'publish' ? t.modelEditor.publishing : t.modelEditor.publish}
            </Button>
          </div>
        </div>

        <div className={styles.meEditScroll}>
          {loading ? (
            <div className={styles.center}>
              <div className={styles.spinner} />
            </div>
          ) : (
            <>
              <div className={styles.segTabs}>
                <button
                  type="button"
                  className={`${styles.segTab} ${activeSource === 'gui' ? styles.segTabActive : ''}`}
                  onClick={() => setActiveSource('gui')}
                >
                  {t.modelEditor.gui}
                </button>
                <button
                  type="button"
                  className={`${styles.segTab} ${activeSource === 'yaml' ? styles.segTabActive : ''}`}
                  onClick={() => setActiveSource('yaml')}
                >
                  {t.modelEditor.yaml}
                </button>
              </div>
              {!canEdit ? (
                <div className={styles.meSourceHint}>{t.modelEditor.readOnlyBuiltin}</div>
              ) : null}
              {activeSource === 'gui' ? (
                <ModelGuiForm value={gui} onChange={onGui} readOnly={!canEdit} />
              ) : (
                <ModelYamlEditor
                  value={yamlText}
                  onChange={onYaml}
                  markers={yamlMarkers}
                  readOnly={!canEdit}
                />
              )}
              <div className={styles.meSourceHint}>{t.modelEditor.sourceHint}</div>
              {error ? <div className={styles.meErr}>{error}</div> : null}
            </>
          )}
        </div>
      </div>

      {/* Right pane: assistant. Its proposals drop into the YAML tab. */}
      <ModelAssistantPanel
        onProposal={(p) => {
          setYamlText(p.yaml);
          setActiveSource('yaml');
          setYamlMarkers([]);
          setError(null);
          setDirty(true);
        }}
      />

      {confirmLeave ? (
        <ConfirmDialog
          title={t.modelEditor.unsavedTitle}
          message={t.modelEditor.unsavedMessage}
          confirmLabel={t.modelEditor.unsavedConfirm}
          onConfirm={() => db.closeEditor()}
          onClose={() => setConfirmLeave(false)}
        />
      ) : null}
    </div>
  );
}
