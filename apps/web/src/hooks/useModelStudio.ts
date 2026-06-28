import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/apiClient';
import {
  createSemanticModel,
  deleteSemanticModel,
  fetchSemanticModel,
  fetchSemanticProject,
  publishSemanticModel,
  updateSemanticModel,
  type CubeJoinDef,
  type ModelStatus,
  type SemanticModel,
  type SemanticProject,
} from '@/lib/dataSources';
import { addJoinToYaml } from '@/lib/cubeYaml';
import type { YamlMarker } from '@/components/model-studio/StudioYamlEditor';

/** One open editor tab. `modelId === null` while a brand-new model is unsaved. */
export interface StudioFile {
  key: string; // stable tab id (modelId, or `new:<n>` for an unsaved model)
  modelId: string | null;
  title: string; // tab label, e.g. "accounts.yml"
  yaml: string; // current editor content
  savedYaml: string; // last-persisted content (dirty = yaml !== savedYaml)
  status: ModelStatus;
  builtin: boolean;
  loading: boolean;
  loadError: string | null;
  saveError: string | null;
  markers: YamlMarker[];
  saving: boolean;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const yamlErrors = (e: unknown): YamlMarker[] =>
  e instanceof ApiError && e.info && typeof e.info === 'object' && 'yamlErrors' in e.info
    ? ((e.info as { yamlErrors?: YamlMarker[] }).yamlErrors ?? [])
    : [];

/** Best-effort tab label from a cube's `name:` line; falls back to `untitled`. */
function fileTitle(yaml: string, fallback: string): string {
  const m = /^name:\s*([A-Za-z_][A-Za-z0-9_]*)/m.exec(yaml);
  return `${m ? m[1] : fallback}.yml`;
}

/**
 * Drives the full-page model studio (v3.2): loads a semantic project + its models,
 * manages the set of open editor tabs (lazy per-file YAML load, dirty tracking),
 * and owns the save-draft / publish-all lifecycle. Independent of `useDataBrowser`
 * — it calls the semantic REST routes (`lib/dataSources`) directly.
 */
export function useModelStudio(projectId: string, untitledLabel: string) {
  const [project, setProject] = useState<SemanticProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<StudioFile[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const newCounter = useRef(0);

  const patchFile = useCallback(
    (key: string, fn: (f: StudioFile) => StudioFile) =>
      setFiles((prev) => prev.map((f) => (f.key === key ? fn(f) : f))),
    [],
  );

  const reloadProject = useCallback(async () => {
    try {
      setProject(await fetchSemanticProject(projectId));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const p = await fetchSemanticProject(projectId);
        if (alive) setProject(p);
      } catch (e) {
        if (alive) setError(errMsg(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Lazy-load a model's YAML the first time its tab opens.
  const loadFile = useCallback(
    async (key: string, modelId: string) => {
      try {
        const m = await fetchSemanticModel(projectId, modelId);
        const yaml = m.yaml ?? '';
        patchFile(key, (f) => ({
          ...f,
          yaml,
          savedYaml: yaml,
          status: m.status ?? 'published',
          builtin: !!m.builtin,
          title: fileTitle(yaml, modelId),
          loading: false,
        }));
      } catch (e) {
        patchFile(key, (f) => ({ ...f, loading: false, loadError: errMsg(e) }));
      }
    },
    [projectId, patchFile],
  );

  const openModel = useCallback(
    (modelId: string) => {
      let existing = false;
      setFiles((prev) => {
        if (prev.some((f) => f.key === modelId)) {
          existing = true;
          return prev;
        }
        return [
          ...prev,
          {
            key: modelId,
            modelId,
            title: `${modelId}.yml`,
            yaml: '',
            savedYaml: '',
            status: 'published',
            builtin: false,
            loading: true,
            loadError: null,
            saveError: null,
            markers: [],
            saving: false,
          },
        ];
      });
      setActiveKey(modelId);
      if (!existing) void loadFile(modelId, modelId);
    },
    [loadFile],
  );

  const openNew = useCallback(
    (template: string) => {
      const key = `new:${newCounter.current++}`;
      setFiles((prev) => [
        ...prev,
        {
          key,
          modelId: null,
          title: fileTitle(template, untitledLabel),
          yaml: template,
          savedYaml: '',
          status: 'draft',
          builtin: false,
          loading: false,
          loadError: null,
          saveError: null,
          markers: [],
          saving: false,
        },
      ]);
      setActiveKey(key);
    },
    [untitledLabel],
  );

  const closeFile = useCallback(
    (key: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.key !== key);
        setActiveKey((cur) => (cur === key ? (next[next.length - 1]?.key ?? null) : cur));
        return next;
      });
    },
    [setActiveKey],
  );

  const editYaml = useCallback(
    (key: string, yaml: string) =>
      patchFile(key, (f) => ({
        ...f,
        yaml,
        title: fileTitle(yaml, f.modelId ?? untitledLabel),
        markers: f.markers.length ? [] : f.markers,
        saveError: null,
      })),
    [patchFile, untitledLabel],
  );

  /** Persist one file. `publish` runs the publish action; returns true on success. */
  const persist = useCallback(
    async (file: StudioFile, publish: boolean): Promise<boolean> => {
      if (file.builtin) return true; // read-only: nothing to do
      patchFile(file.key, (f) => ({ ...f, saving: true, saveError: null, markers: [] }));
      try {
        if (file.modelId == null) {
          const created = await createSemanticModel(projectId, {
            source: 'yaml',
            yaml: file.yaml,
            publish,
          });
          patchFile(file.key, (f) => ({
            ...f,
            modelId: created.id,
            savedYaml: f.yaml,
            status: created.status ?? 'published',
            saving: false,
          }));
        } else {
          const updated = await updateSemanticModel(projectId, file.modelId, {
            source: 'yaml',
            yaml: file.yaml,
            action: publish ? 'publish' : 'save',
          });
          patchFile(file.key, (f) => ({
            ...f,
            savedYaml: f.yaml,
            status: updated?.status ?? 'published',
            saving: false,
          }));
        }
        return true;
      } catch (e) {
        patchFile(file.key, (f) => ({
          ...f,
          saving: false,
          saveError: errMsg(e),
          markers: yamlErrors(e),
        }));
        return false;
      }
    },
    [projectId, patchFile],
  );

  const saveFile = useCallback(
    async (key: string) => {
      const file = files.find((f) => f.key === key);
      if (!file || file.builtin || file.saving) return;
      const ok = await persist(file, false);
      if (ok) await reloadProject();
    },
    [files, persist, reloadProject],
  );

  /** Project-level publish: save+publish every open file that has unpublished work,
   *  then publish any remaining draft models that aren't open. */
  const publishAll = useCallback(async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      const openModelIds = new Set(files.map((f) => f.modelId).filter(Boolean) as string[]);
      // 1) Open files with edits or an unpublished status.
      for (const f of files) {
        const dirty = f.yaml !== f.savedYaml;
        if (f.builtin) continue;
        if (dirty || f.status !== 'published' || f.modelId == null) {
          const ok = await persist(f, true);
          if (!ok) {
            setActiveKey(f.key);
            return;
          }
        }
      }
      // 2) Draft / draft_pending models that aren't open in a tab.
      for (const m of project?.models ?? []) {
        if (m.builtin || openModelIds.has(m.id)) continue;
        if (m.status === 'draft' || m.status === 'draft_pending') {
          await publishSemanticModel(projectId, m.id).catch(() => null);
        }
      }
      await reloadProject();
    } finally {
      setPublishing(false);
    }
  }, [publishing, files, project, projectId, persist, reloadProject]);

  const removeModel = useCallback(
    async (modelId: string) => {
      await deleteSemanticModel(projectId, modelId);
      closeFile(modelId);
      await reloadProject();
    },
    [projectId, closeFile, reloadProject],
  );

  /** Drop an assistant proposal's YAML into the active file (or open a new one). */
  const applyProposal = useCallback(
    (yaml: string, template: string) => {
      setActiveKey((cur) => {
        if (cur) {
          patchFile(cur, (f) =>
            f.builtin
              ? f
              : { ...f, yaml, title: fileTitle(yaml, f.modelId ?? untitledLabel), markers: [] },
          );
          return cur;
        }
        // No open file → open a new one seeded with the proposal.
        const key = `new:${newCounter.current++}`;
        setFiles((prev) => [
          ...prev,
          {
            key,
            modelId: null,
            title: fileTitle(yaml, untitledLabel),
            yaml: yaml || template,
            savedYaml: '',
            status: 'draft',
            builtin: false,
            loading: false,
            loadError: null,
            saveError: null,
            markers: [],
            saving: false,
          },
        ]);
        return key;
      });
    },
    [patchFile, untitledLabel],
  );

  /** Merge a visually-built relation into the active file's YAML (the dialog's
   *  output flows through the normal save/validate path, not a second submit). */
  const addJoinToActive = useCallback(
    (join: CubeJoinDef) => {
      const file = files.find((f) => f.key === activeKey);
      if (!file || file.builtin) return;
      editYaml(file.key, addJoinToYaml(file.yaml, join));
    },
    [files, activeKey, editYaml],
  );

  const activeFile = files.find((f) => f.key === activeKey) ?? null;
  const models = project?.models ?? [];
  const errorCount = useMemo(() => files.reduce((n, f) => n + f.markers.length, 0), [files]);
  const openModelIds = useMemo(
    () => new Set(files.map((f) => f.modelId).filter(Boolean) as string[]),
    [files],
  );

  return {
    project,
    loading,
    error,
    files,
    models,
    activeKey,
    activeFile,
    openModelIds,
    publishing,
    errorCount,
    setActiveKey,
    openModel,
    openNew,
    closeFile,
    editYaml,
    saveFile,
    publishAll,
    removeModel,
    applyProposal,
    addJoinToActive,
  };
}

export type ModelStudioState = ReturnType<typeof useModelStudio>;
export type { SemanticModel };
