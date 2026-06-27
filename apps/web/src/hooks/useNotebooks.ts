import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVE_NOTEBOOK_KEY,
  DEFAULT_NOTEBOOK_TITLE,
  createNotebook as createNotebookApi,
  deleteNotebook as deleteNotebookApi,
  getNotebook,
  listNotebooks,
  newSqlCell,
  newVizCell,
  runCell as runCellApi,
  summaryOf,
  updateNotebook,
  type Notebook,
  type NotebookCell,
  type NotebookSummary,
  type SqlRunResult,
} from '@/lib/notebooks';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const ACTIVE_KEY = ACTIVE_NOTEBOOK_KEY;
const readActive = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};
const writeActive = (id: string | null) => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage unavailable (private mode) — selection just won't persist */
  }
};

/** Runtime (un-persisted) execution state for a single cell. */
export interface CellRunState {
  status: 'idle' | 'running' | 'done' | 'error';
  result?: SqlRunResult;
  errorText?: string;
  ranAt?: number;
}

const SAVE_DEBOUNCE_MS = 700;

/**
 * Notebook state machine (v2.0) — mirrors `useDataBrowser`/`useThreads`: a
 * lazy-loaded list, an active notebook hydrated on open, optimistic cell edits
 * with a debounced autosave, and per-cell run state.
 *
 * Saving is **coalesced**: at most one save is in flight, and the latest edit
 * is always the one that lands (a follow-up runs when the in-flight one
 * resolves). Navigating away **flushes** the pending edit (so nothing is lost),
 * and deleting the active notebook **cancels** it. Persistence saves only the
 * notebook's content (title + cells); a cell's run result lives in `results`
 * (runtime-only) and is repopulated by `runCell`.
 */
export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [notebookLoading, setNotebookLoading] = useState(false);
  const [notebookError, setNotebookError] = useState<string | null>(null);

  const [results, setResults] = useState<Record<string, CellRunState>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Latest active notebook + its id, so callbacks never read a stale closure
  // and survive async gaps (open races, in-flight saves).
  const activeRef = useRef<Notebook | null>(null);
  const activeIdRef = useRef<string | null>(null);
  // Save coalescing: the latest notebook awaiting save, a timer for the debounce,
  // and a flag so only one save runs at a time.
  const pendingRef = useRef<Notebook | null>(null);
  const saveTimer = useRef<number | null>(null);
  const savingRef = useRef(false);
  const didInit = useRef(false);

  const setActive = useCallback((nb: Notebook | null) => {
    activeRef.current = nb;
    setActiveNotebook(nb);
  }, []);

  // --- list ---
  const refreshList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const loaded = await listNotebooks();
      setNotebooks(loaded);
      return loaded;
    } catch (e) {
      setListError(errMsg(e));
      return [] as NotebookSummary[];
    } finally {
      setListLoading(false);
    }
  }, []);

  // --- persistence (coalesced, debounced autosave) ---
  const runSave = useCallback(async () => {
    if (savingRef.current) return; // a save is in flight; it re-checks on finish
    const nb = pendingRef.current;
    if (!nb) return;
    pendingRef.current = null;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateNotebook(nb.id, { title: nb.title, cells: nb.cells });
      setNotebooks((prev) => prev.map((n) => (n.id === saved.id ? summaryOf(saved) : n)));
    } catch (e) {
      setSaveError(errMsg(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingRef.current) void runSave(); // coalesced follow-up with the latest edit
    }
  }, []);

  const clearSaveTimer = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  /** Persist any pending edit now (used before switching notebooks). */
  const flushSave = useCallback(() => {
    clearSaveTimer();
    void runSave();
  }, [clearSaveTimer, runSave]);

  /** Drop any pending edit (used when the pending notebook is being deleted). */
  const cancelPendingSave = useCallback(() => {
    clearSaveTimer();
    pendingRef.current = null;
  }, [clearSaveTimer]);

  const schedulePersist = useCallback(
    (nb: Notebook, immediate: boolean) => {
      pendingRef.current = nb;
      clearSaveTimer();
      if (immediate) {
        void runSave();
        return;
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void runSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [clearSaveTimer, runSave],
  );

  /** Mutate the active notebook in place + schedule a save. */
  const mutateActive = useCallback(
    (mutate: (nb: Notebook) => Notebook, immediate = false) => {
      const cur = activeRef.current;
      if (!cur) return;
      const next = mutate(cur);
      setActive(next);
      schedulePersist(next, immediate);
    },
    [setActive, schedulePersist],
  );

  // --- open / close ---
  const openNotebook = useCallback(
    async (id: string) => {
      flushSave(); // persist any pending edit to the previous notebook first
      setActiveId(id);
      activeIdRef.current = id;
      writeActive(id);
      setActive(null);
      setResults({});
      setNotebookError(null);
      setNotebookLoading(true);
      try {
        const nb = await getNotebook(id);
        if (activeIdRef.current !== id) return; // superseded by a newer open
        setActive(nb);
      } catch (e) {
        if (activeIdRef.current !== id) return;
        setNotebookError(errMsg(e));
      } finally {
        if (activeIdRef.current === id) setNotebookLoading(false);
      }
    },
    [flushSave, setActive],
  );

  const backToList = useCallback(() => {
    flushSave();
    setActiveId(null);
    activeIdRef.current = null;
    writeActive(null);
    setActive(null);
    setResults({});
  }, [flushSave, setActive]);

  // --- load list on mount, restore the active selection ---
  useEffect(() => {
    if (didInit.current) return; // guard StrictMode double-invoke
    didInit.current = true;
    void (async () => {
      const loaded = await refreshList();
      const saved = readActive();
      if (saved && loaded.some((n) => n.id === saved)) {
        void openNotebook(saved);
      }
    })();
  }, [refreshList, openNotebook]);

  // --- notebook CRUD ---
  const createNotebook = useCallback(async () => {
    flushSave(); // persist any pending edit before switching away
    setListError(null);
    try {
      const nb = await createNotebookApi({ title: DEFAULT_NOTEBOOK_TITLE, cells: [newSqlCell()] });
      setNotebooks((prev) => [summaryOf(nb), ...prev]);
      setActiveId(nb.id);
      activeIdRef.current = nb.id;
      writeActive(nb.id);
      setActive(nb);
      setResults({});
      setNotebookError(null);
    } catch (e) {
      setListError(errMsg(e));
    }
  }, [flushSave, setActive]);

  const renameNotebook = useCallback(
    (rawTitle: string) => {
      const title = rawTitle.length ? rawTitle : DEFAULT_NOTEBOOK_TITLE;
      mutateActive((nb) => ({ ...nb, title }));
    },
    [mutateActive],
  );

  const deleteNotebook = useCallback(
    async (id: string) => {
      setNotebooks((prev) => prev.filter((n) => n.id !== id));
      if (activeRef.current?.id === id) {
        cancelPendingSave(); // don't save a notebook we're deleting
        setActiveId(null);
        activeIdRef.current = null;
        writeActive(null);
        setActive(null);
        setResults({});
      }
      try {
        await deleteNotebookApi(id);
      } catch (e) {
        console.error('Failed to delete notebook', e);
        void refreshList();
      }
    },
    [cancelPendingSave, setActive, refreshList],
  );

  // --- cell ops ---
  const addCell = useCallback(() => {
    mutateActive((nb) => ({ ...nb, cells: [...nb.cells, newSqlCell()] }), true);
  }, [mutateActive]);

  /** Append a viz cell, defaulting its source to the last SQL cell with an output name. */
  const addVizCell = useCallback(() => {
    mutateActive((nb) => {
      const lastNamed = [...nb.cells].reverse().find((c) => c.kind === 'sql' && c.outputName);
      return { ...nb, cells: [...nb.cells, newVizCell(lastNamed?.outputName)] };
    }, true);
  }, [mutateActive]);

  /** Persist a viz cell's DSL (debounced — the Designer fires onChange on every edit). */
  const updateCellDsl = useCallback(
    (cellId: string, dsl: unknown) => {
      mutateActive((nb) => ({
        ...nb,
        cells: nb.cells.map((c) => (c.id === cellId ? { ...c, dsl } : c)),
      }));
    },
    [mutateActive],
  );

  /** Rebind a viz cell to a different upstream SQL cell output. */
  const updateCellSourceOutputName = useCallback(
    (cellId: string, sourceOutputName: string) => {
      const next = sourceOutputName.trim() || undefined;
      mutateActive(
        (nb) => ({
          ...nb,
          // Changing the source invalidates the old DSL (different columns).
          cells: nb.cells.map((c) =>
            c.id === cellId ? { ...c, sourceOutputName: next, dsl: undefined } : c,
          ),
        }),
        true,
      );
    },
    [mutateActive],
  );

  const updateCellSource = useCallback(
    (cellId: string, source: string) => {
      mutateActive((nb) => ({
        ...nb,
        cells: nb.cells.map((c) => (c.id === cellId ? { ...c, source } : c)),
      }));
    },
    [mutateActive],
  );

  const updateCellOutputName = useCallback(
    (cellId: string, outputName: string) => {
      const next = outputName.trim() || undefined;
      mutateActive((nb) => ({
        ...nb,
        cells: nb.cells.map((c) => (c.id === cellId ? { ...c, outputName: next } : c)),
      }));
    },
    [mutateActive],
  );

  const deleteCell = useCallback(
    (cellId: string) => {
      mutateActive((nb) => ({ ...nb, cells: nb.cells.filter((c) => c.id !== cellId) }), true);
      setResults((prev) => {
        const next = { ...prev };
        delete next[cellId];
        return next;
      });
    },
    [mutateActive],
  );

  const moveCell = useCallback(
    (cellId: string, dir: -1 | 1) => {
      mutateActive((nb) => {
        const idx = nb.cells.findIndex((c) => c.id === cellId);
        const swap = idx + dir;
        if (idx < 0 || swap < 0 || swap >= nb.cells.length) return nb;
        const cells = [...nb.cells];
        [cells[idx], cells[swap]] = [cells[swap], cells[idx]];
        return { ...nb, cells };
      }, true);
    },
    [mutateActive],
  );

  // --- execution ---
  const runCell = useCallback(async (cell: NotebookCell) => {
    if (!cell.source.trim()) {
      setResults((prev) => ({
        ...prev,
        [cell.id]: { status: 'error', errorText: 'This cell is empty.' },
      }));
      return;
    }
    setResults((prev) => ({ ...prev, [cell.id]: { ...prev[cell.id], status: 'running' } }));
    try {
      // Send the whole notebook so the backend can resolve outputName chaining.
      const cells = activeRef.current?.cells ?? [cell];
      const result = await runCellApi(cells, cell.id, cell.datasourceId);
      setResults((prev) => ({
        ...prev,
        [cell.id]: { status: 'done', result, ranAt: Date.now() },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [cell.id]: { status: 'error', errorText: errMsg(e), ranAt: Date.now() },
      }));
    }
  }, []);

  const runAll = useCallback(async () => {
    const nb = activeRef.current;
    if (!nb) return;
    // Sequential — keeps the warehouse calm and the timeline easy to follow.
    // Re-read each cell from the live notebook so edits made during a long run
    // (and not yet-deleted cells) are honored.
    for (const { id } of nb.cells) {
      const live = activeRef.current?.cells.find((c) => c.id === id);
      if (live && live.kind === 'sql') await runCell(live);
    }
  }, [runCell]);

  return {
    // list
    notebooks,
    listLoading,
    listError,
    refreshList,
    // active
    activeId,
    activeNotebook,
    notebookLoading,
    notebookError,
    openNotebook,
    backToList,
    retryOpen: () => activeId && openNotebook(activeId),
    // crud
    createNotebook,
    renameNotebook,
    deleteNotebook,
    // cells
    addCell,
    addVizCell,
    updateCellSource,
    updateCellOutputName,
    updateCellDsl,
    updateCellSourceOutputName,
    deleteCell,
    moveCell,
    // execution
    results,
    runCell,
    runAll,
    // save status
    saving,
    saveError,
  };
}

export type NotebookState = ReturnType<typeof useNotebooks>;
