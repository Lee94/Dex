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

/** One row in the Files directory — a persisted model OR an open-but-unsaved file. */
export interface StudioDirEntry {
  key: string; // tab key to focus when clicked
  modelId: string | null; // null for an unsaved new file
  name: string; // bare display name (no `.yml`)
  status: ModelStatus;
  builtin: boolean;
  endorsed: boolean;
  unsaved: boolean; // true = new file not yet persisted
  active: boolean; // its tab is the active one
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const stripYml = (t: string) => t.replace(/\.yml$/, '');
const yamlErrors = (e: unknown): YamlMarker[] =>
  e instanceof ApiError && e.info && typeof e.info === 'object' && 'yamlErrors' in e.info
    ? ((e.info as { yamlErrors?: YamlMarker[] }).yamlErrors ?? [])
    : [];

/** Best-effort tab label from a cube's `name:` line; falls back to `untitled`. */
function fileTitle(yaml: string, fallback: string): string {
  const m = /^name:\s*([A-Za-z_][A-Za-z0-9_]*)/m.exec(yaml);
  return `${m ? m[1] : fallback}.yml`;
}

// How long the editor stays idle before an edited file is auto-saved to the
// server as a draft. Each keystroke resets the timer, so we save on a pause.
export const AUTOSAVE_MS = 1200;

// --- unsaved-draft localStorage fallback ------------------------------------
// Autosave persists *valid* drafts to the server, but a brand-new file whose YAML
// is still incomplete/invalid (e.g. an unknown base table) can't land there yet.
// We mirror such unsaved new files (modelId === null) to localStorage per project
// and rehydrate them on mount, so in-progress work survives a reload until it's
// valid enough to save server-side — at which point this local copy is cleared.

const DRAFTS_PREFIX = 'dex.modelStudio.drafts.';

interface PersistedDraft {
  key: string;
  title: string;
  yaml: string;
}

/** Read a project's unsaved new-file drafts back into editor tabs (best-effort). */
function loadPersistedDrafts(projectId: string): StudioFile[] {
  try {
    const raw = localStorage.getItem(DRAFTS_PREFIX + projectId);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PersistedDraft[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((d) => d && typeof d.key === 'string' && typeof d.yaml === 'string')
      .map((d) => ({
        key: d.key,
        modelId: null,
        title: d.title || 'untitled.yml',
        yaml: d.yaml,
        savedYaml: '', // stays dirty until it lands on the server
        status: 'draft' as ModelStatus,
        builtin: false,
        loading: false,
        loadError: null,
        saveError: null,
        markers: [],
        saving: false,
      }));
  } catch {
    return [];
  }
}

/** Persist the project's unsaved new files (clears the key when there are none). */
function savePersistedDrafts(projectId: string, drafts: PersistedDraft[]): void {
  try {
    if (drafts.length === 0) localStorage.removeItem(DRAFTS_PREFIX + projectId);
    else localStorage.setItem(DRAFTS_PREFIX + projectId, JSON.stringify(drafts));
  } catch {
    /* storage unavailable (private mode / quota) — drafts just won't survive a reload */
  }
}

/** Next `new:<n>` counter value above any restored draft keys (avoids key reuse). */
function nextDraftCounter(files: StudioFile[]): number {
  let max = -1;
  for (const f of files) {
    const m = /^new:(\d+)$/.exec(f.key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
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
  // Rehydrate localStorage-fallback drafts (unsaved new files) once, on mount.
  const restored = useRef<StudioFile[] | null>(null);
  if (restored.current === null) restored.current = loadPersistedDrafts(projectId);
  const [files, setFiles] = useState<StudioFile[]>(restored.current);
  const [activeKey, setActiveKey] = useState<string | null>(restored.current[0]?.key ?? null);
  const [publishing, setPublishing] = useState(false);
  const newCounter = useRef(nextDraftCounter(restored.current));

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

  // Mirror still-unsaved new files (modelId === null) to localStorage as a fallback
  // for drafts the server can't accept yet. A file that lands on the server (modelId
  // set) or is closed drops out of this set, clearing its local copy.
  useEffect(() => {
    savePersistedDrafts(
      projectId,
      files
        .filter((f) => f.modelId == null)
        .map((f) => ({ key: f.key, title: f.title, yaml: f.yaml })),
    );
  }, [files, projectId]);

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
      let focusKey = modelId;
      setFiles((prev) => {
        // Match by tab key OR modelId: a model saved from a `new:<n>` tab keeps that
        // key, so the directory (keyed by model id) must still find its open tab.
        const found = prev.find((f) => f.key === modelId || f.modelId === modelId);
        if (found) {
          existing = true;
          focusKey = found.key;
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
      setActiveKey(focusKey);
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
            // A rename changes the stored id (id === cube name); follow it so the
            // next save targets the right model instead of 404-ing on the old name.
            modelId: updated?.id ?? f.modelId,
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

  // Auto-save edited files to the server as drafts once typing pauses, so an
  // in-progress model survives a reload. Saved files stay drafts (invisible to
  // the agent until published). A keystroke resets the timer; a YAML the server
  // rejected (saveError) is retried only after the user edits it again — editYaml
  // clears saveError — so an invalid draft never busy-loops the API. Saving every
  // dirty file (not just the active tab) means switching tabs can't lose edits.
  useEffect(() => {
    if (publishing) return;
    const dirty = files.filter(
      (f) => !f.builtin && !f.saving && !f.loadError && !f.saveError && f.yaml !== f.savedYaml,
    );
    if (dirty.length === 0) return;
    const id = setTimeout(() => {
      for (const f of dirty) void saveFile(f.key);
    }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [files, publishing, saveFile]);

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
      // Close the open tab for this model — its key may be `new:<n>` (saved from a
      // new tab), so match on modelId rather than assuming key === modelId.
      setFiles((prev) => {
        const closed = prev.find((f) => f.modelId === modelId);
        if (!closed) return prev;
        const next = prev.filter((f) => f.key !== closed.key);
        setActiveKey((cur) => (cur === closed.key ? (next[next.length - 1]?.key ?? null) : cur));
        return next;
      });
      await reloadProject();
    },
    [projectId, reloadProject],
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
  const models = useMemo(() => project?.models ?? [], [project]);
  const errorCount = useMemo(() => files.reduce((n, f) => n + f.markers.length, 0), [files]);
  const openModelIds = useMemo(
    () => new Set(files.map((f) => f.modelId).filter(Boolean) as string[]),
    [files],
  );

  /** Focus an existing directory entry's tab (re-loading it if it's a persisted
   *  model that isn't open yet). */
  const openEntry = useCallback(
    (e: StudioDirEntry) => {
      if (e.modelId) openModel(e.modelId);
      else setActiveKey(e.key);
    },
    [openModel],
  );

  /** The Files directory: persisted models PLUS any open unsaved new file, so a
   *  brand-new tab shows up in the tree immediately. An open file's live `name:`
   *  (from its YAML) drives the display name, keeping the row and tab in sync. */
  const directory = useMemo<StudioDirEntry[]>(() => {
    const activeModelId = activeFile?.modelId ?? null;
    const modelIds = new Set(models.map((m) => m.id));
    const openByModel = new Map(
      files.filter((f) => f.modelId).map((f) => [f.modelId as string, f]),
    );
    const persisted: StudioDirEntry[] = models.map((m) => {
      const open = openByModel.get(m.id);
      return {
        key: open?.key ?? m.id,
        modelId: m.id,
        name: open ? stripYml(open.title) : m.name,
        status: open?.status ?? m.status ?? 'published',
        builtin: !!m.builtin,
        endorsed: !!m.endorsed,
        unsaved: false,
        active: activeModelId === m.id,
      };
    });
    // Open files not (yet) in the persisted list: a brand-new file (modelId null),
    // or one just saved/renamed before `reloadProject` lands. Showing them here
    // keeps the directory and tabs in lockstep with no flicker.
    const extras: StudioDirEntry[] = files
      .filter((f) => f.modelId == null || !modelIds.has(f.modelId))
      .map((f) => ({
        key: f.key,
        modelId: f.modelId,
        name: stripYml(f.title),
        status: f.status,
        builtin: false,
        endorsed: false,
        unsaved: f.modelId == null,
        active: f.modelId ? activeModelId === f.modelId : activeKey === f.key,
      }));
    return [...persisted, ...extras];
  }, [models, files, activeFile, activeKey]);

  return {
    project,
    loading,
    error,
    files,
    models,
    directory,
    activeKey,
    activeFile,
    openModelIds,
    publishing,
    errorCount,
    setActiveKey,
    openModel,
    openEntry,
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
