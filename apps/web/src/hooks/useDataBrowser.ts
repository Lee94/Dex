import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDataSource,
  createSemanticModel,
  deleteDataSource,
  deleteSemanticModel,
  fetchPreview,
  fetchSchemaTree,
  fetchSemanticModel,
  fetchSemanticProject,
  fetchTableDetail,
  listDataSources,
  listSemanticProjects,
  refreshMetadata,
  updateMetadata,
  type DataSource,
  type MetadataPatch,
  type NewConnectionInput,
  type NewModelInput,
  type PreviewResult,
  type SchemaNode,
  type SemanticModel,
  type SemanticProject,
  type TableDetail,
} from '@/lib/dataSources';

export type HeaderTab = 'recommended' | 'warehouse' | 'datamodels' | 'curation';
export type DetailTab = 'columns' | 'preview';
export type DmTab = 'preview' | 'dims';

const tableKey = (connId: string, table: string) => `${connId}::${table}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Data-browser state machine (v0.6) — mirrors the design prototype's `renderVals`
 * selector, but loads from the backend lazily and caches per id. One hook drives
 * the whole module: source list, schema/table tree, table detail + preview,
 * metadata edits (optimistic), the Add-connection flow, and the Data Models tabs.
 */
export function useDataBrowser() {
  const [headerTab, setHeaderTab] = useState<HeaderTab>('warehouse');

  // --- sources ---
  const [sources, setSources] = useState<DataSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  // --- selection ---
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('columns');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // --- caches ---
  const [treeByConn, setTreeByConn] = useState<Record<string, SchemaNode[]>>({});
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [detailByKey, setDetailByKey] = useState<Record<string, TableDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [previewByKey, setPreviewByKey] = useState<Record<string, PreviewResult>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // --- data models ---
  const [projects, setProjects] = useState<SemanticProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<SemanticProject | null>(null);
  const [modelDetail, setModelDetail] = useState<SemanticModel | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [dmTab, setDmTab] = useState<DmTab>('dims');

  // --- loaders ---
  const refreshSources = useCallback(async () => {
    setSourcesLoading(true);
    setSourcesError(null);
    try {
      setSources(await listDataSources());
    } catch (e) {
      setSourcesError(errMsg(e));
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  const loadTree = useCallback(async (connId: string, force = false) => {
    setTreeError(null);
    if (!force) {
      let cached = false;
      setTreeByConn((prev) => {
        cached = !!prev[connId];
        return prev;
      });
      if (cached) return;
    }
    setTreeLoading(true);
    try {
      const schemas = force ? await refreshMetadata(connId) : await fetchSchemaTree(connId);
      setTreeByConn((prev) => ({ ...prev, [connId]: schemas }));
      // Auto-expand endorsed schemas (or the only schema) on first load.
      setExpanded((prev) => {
        const next = { ...prev };
        for (const s of schemas) {
          if (next[s.id] === undefined) next[s.id] = schemas.length === 1 || s.endorsed;
        }
        return next;
      });
    } catch (e) {
      setTreeError(errMsg(e));
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const selectConn = useCallback(
    (id: string) => {
      setSelectedConnId(id);
      setSelectedTable(null);
      setSearch('');
      void loadTree(id);
    },
    [loadTree],
  );

  const backToSources = useCallback(() => {
    setSelectedConnId(null);
    setSelectedTable(null);
  }, []);

  const toggleSchema = useCallback((schemaId: string) => {
    setExpanded((prev) => ({ ...prev, [schemaId]: !prev[schemaId] }));
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = false;
      return next;
    });
  }, []);

  const loadDetail = useCallback(async (connId: string, table: string) => {
    const key = tableKey(connId, table);
    setDetailError(null);
    let cached = false;
    setDetailByKey((prev) => {
      cached = !!prev[key];
      return prev;
    });
    if (cached) return;
    setDetailLoading(true);
    try {
      const detail = await fetchTableDetail(connId, table);
      setDetailByKey((prev) => ({ ...prev, [key]: detail }));
    } catch (e) {
      setDetailError(errMsg(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async (connId: string, table: string) => {
    const key = tableKey(connId, table);
    setPreviewError(null);
    let cached = false;
    setPreviewByKey((prev) => {
      cached = !!prev[key];
      return prev;
    });
    if (cached) return;
    setPreviewLoading(true);
    try {
      const preview = await fetchPreview(connId, table, 50);
      setPreviewByKey((prev) => ({ ...prev, [key]: preview }));
    } catch (e) {
      setPreviewError(errMsg(e));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const selectTable = useCallback(
    (table: string) => {
      if (!selectedConnId) return;
      setSelectedTable(table);
      setDetailTab('columns');
      void loadDetail(selectedConnId, table);
    },
    [selectedConnId, loadDetail],
  );

  const gotoSchema = useCallback(() => setSelectedTable(null), []);

  const pickDetailTab = useCallback(
    (tab: DetailTab) => {
      setDetailTab(tab);
      if (tab === 'preview' && selectedConnId && selectedTable) {
        void loadPreview(selectedConnId, selectedTable);
      }
    },
    [selectedConnId, selectedTable, loadPreview],
  );

  const refresh = useCallback(() => {
    if (selectedConnId) void loadTree(selectedConnId, true);
  }, [selectedConnId, loadTree]);

  // --- metadata (optimistic) ---
  const patchMetadata = useCallback(
    async (patch: MetadataPatch) => {
      if (!selectedConnId) return;
      const connId = selectedConnId;
      const key = tableKey(connId, patch.table);
      // optimistic: patch local detail + tree
      setDetailByKey((prev) => {
        const cur = prev[key];
        if (!cur) return prev;
        if (patch.column) {
          return {
            ...prev,
            [key]: {
              ...cur,
              columns: cur.columns.map((col) =>
                col.name === patch.column
                  ? {
                      ...col,
                      description: patch.description ?? col.description,
                      status: patch.status ?? col.status,
                      includedForAi: patch.includedForAi ?? col.includedForAi,
                    }
                  : col,
              ),
            },
          };
        }
        return {
          ...prev,
          [key]: {
            ...cur,
            metadata: {
              ...cur.metadata,
              description:
                patch.description !== undefined ? patch.description : cur.metadata.description,
              status: patch.status !== undefined ? patch.status : cur.metadata.status,
              categories: patch.categories ?? cur.metadata.categories,
              includedForAi: patch.includedForAi ?? cur.metadata.includedForAi,
            },
          },
        };
      });
      if (!patch.column) {
        setTreeByConn((prev) => {
          const schemas = prev[connId];
          if (!schemas) return prev;
          return {
            ...prev,
            [connId]: schemas.map((s) => ({
              ...s,
              tables: s.tables.map((t) =>
                t.name === patch.table
                  ? {
                      ...t,
                      endorsed:
                        patch.status !== undefined ? patch.status === 'endorsed' : t.endorsed,
                      description:
                        patch.description !== undefined ? patch.description : t.description,
                    }
                  : t,
              ),
            })),
          };
        });
      }
      try {
        await updateMetadata(connId, patch);
      } catch (e) {
        // best-effort: reload the authoritative detail on failure
        console.error('metadata update failed', e);
        setDetailByKey((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        void loadDetail(connId, patch.table);
      }
    },
    [selectedConnId, loadDetail],
  );

  // --- add / remove connections ---
  const addConnection = useCallback(
    async (input: NewConnectionInput): Promise<DataSource> => {
      const created = await addDataSource(input);
      await refreshSources();
      selectConn(created.id);
      return created;
    },
    [refreshSources, selectConn],
  );

  const removeConnection = useCallback(
    async (id: string) => {
      await deleteDataSource(id);
      if (selectedConnId === id) backToSources();
      await refreshSources();
    },
    [selectedConnId, backToSources, refreshSources],
  );

  // --- data models ---
  const loadProjects = useCallback(async () => {
    let has = false;
    setProjects((prev) => {
      has = prev.length > 0;
      return prev;
    });
    if (has) return;
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      setProjects(await listSemanticProjects());
    } catch (e) {
      setProjectsError(errMsg(e));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const pickHeader = useCallback(
    (tab: HeaderTab) => {
      setHeaderTab(tab);
      if (tab === 'datamodels') void loadProjects();
    },
    [loadProjects],
  );

  const openProject = useCallback(async (projectId: string) => {
    setModelDetail(null);
    setProjectDetail(null);
    try {
      setProjectDetail(await fetchSemanticProject(projectId));
    } catch (e) {
      setProjectsError(errMsg(e));
    }
  }, []);

  const backToProjects = useCallback(() => {
    setProjectDetail(null);
    setModelDetail(null);
  }, []);

  const openModel = useCallback(
    async (modelId: string) => {
      if (!projectDetail) return;
      setModelLoading(true);
      setDmTab('dims');
      try {
        setModelDetail(await fetchSemanticModel(projectDetail.id, modelId));
      } catch (e) {
        setProjectsError(errMsg(e));
      } finally {
        setModelLoading(false);
      }
    },
    [projectDetail],
  );

  const backToModels = useCallback(() => setModelDetail(null), []);

  // Re-fetch a project's detail (the models grid) + the cached project list
  // (the modelCount) after a model is added or removed.
  const reloadProject = useCallback(async (projectId: string) => {
    const [detail, list] = await Promise.all([
      fetchSemanticProject(projectId),
      listSemanticProjects().catch(() => null),
    ]);
    setProjectDetail(detail);
    if (list) setProjects(list);
  }, []);

  const addModel = useCallback(
    async (input: NewModelInput) => {
      const projectId = projectDetail?.id ?? 'dex';
      await createSemanticModel(projectId, input);
      await reloadProject(projectId);
    },
    [projectDetail, reloadProject],
  );

  const removeModel = useCallback(
    async (modelId: string) => {
      const projectId = projectDetail?.id ?? 'dex';
      await deleteSemanticModel(projectId, modelId);
      setModelDetail((cur) => (cur?.id === modelId ? null : cur));
      await reloadProject(projectId);
    },
    [projectDetail, reloadProject],
  );

  // --- derived: filtered tree + noResults (mirrors renderVals search) ---
  const { visibleSchemas, noResults } = useMemo(() => {
    const tree = treeByConn[selectedConnId ?? ''] ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return { visibleSchemas: tree, noResults: false };
    const filtered = tree
      .map((s) => ({ ...s, tables: s.tables.filter((t) => t.name.toLowerCase().includes(q)) }))
      .filter((s) => s.tables.length > 0 || s.name.toLowerCase().includes(q));
    return { visibleSchemas: filtered, noResults: filtered.length === 0 };
  }, [treeByConn, selectedConnId, search]);

  const searching = search.trim().length > 0;
  const detail =
    selectedConnId && selectedTable
      ? detailByKey[tableKey(selectedConnId, selectedTable)]
      : undefined;
  const preview =
    selectedConnId && selectedTable
      ? previewByKey[tableKey(selectedConnId, selectedTable)]
      : undefined;
  const selectedSource = sources.find((s) => s.id === selectedConnId) ?? null;

  return {
    // header
    headerTab,
    pickHeader,
    // sources
    sources,
    sourcesLoading,
    sourcesError,
    refreshSources,
    selectedConnId,
    selectedSource,
    selectConn,
    backToSources,
    addConnection,
    removeConnection,
    // tree
    visibleSchemas,
    noResults,
    searching,
    treeLoading,
    treeError,
    search,
    setSearch,
    expanded: (id: string) => (searching ? true : !!expanded[id]),
    toggleSchema,
    collapseAll,
    refresh,
    // detail
    selectedTable,
    selectTable,
    gotoSchema,
    detailTab,
    pickDetailTab,
    detail,
    detailLoading,
    detailError,
    preview,
    previewLoading,
    previewError,
    // metadata
    patchMetadata,
    // data models
    projects,
    projectsLoading,
    projectsError,
    projectDetail,
    openProject,
    backToProjects,
    modelDetail,
    modelLoading,
    openModel,
    backToModels,
    addModel,
    removeModel,
    dmTab,
    setDmTab,
  };
}

export type DataBrowserState = ReturnType<typeof useDataBrowser>;
