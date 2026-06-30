import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  fetchSchemaTree,
  fetchSemanticProject,
  listDataSources,
  listSemanticProjects,
  type DataSource,
  type SchemaNode,
  type SemanticModel,
} from '@/lib/dataSources';
import { listUploads, uploadFile, type Upload } from '@/lib/uploads';
import type { Attachment } from '@/lib/attachments';
import { useT } from '@/i18n';
import styles from './Composer.module.css';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Popover for the composer's "+" button: pick a database, a table, or a semantic
 * model to scope the next question to. Selections are surfaced as removable chips
 * in the composer and folded into the message sent to the agent.
 */
export function ContextPicker({
  selected,
  onToggle,
  onClose,
}: {
  selected: Set<string>;
  onToggle: (a: Attachment) => void;
  onClose: () => void;
}) {
  const [sources, setSources] = useState<DataSource[]>([]);
  // Each pickable model carries its semantic project so the attachment can tell
  // the agent which project (and thus data source) to query it through.
  const [models, setModels] = useState<{ model: SemanticModel; projectId: string }[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [treeByConn, setTreeByConn] = useState<Record<string, SchemaNode[]>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [srcs, projectList, ups] = await Promise.all([
          listDataSources(),
          listSemanticProjects().catch(() => []),
          listUploads().catch(() => [] as Upload[]),
        ]);
        // Pull each project's full detail (the list view omits models), across the
        // built-in `dex` project and every user-created one.
        const details = await Promise.all(
          projectList.map((p) => fetchSemanticProject(p.id).catch(() => null)),
        );
        if (!alive) return;
        setSources(srcs);
        setModels(
          details.flatMap((p) =>
            p
              ? // Drafts aren't live to the agent — only offer queryable models.
                (p.models ?? [])
                  .filter((m) => m.status !== 'draft')
                  .map((model) => ({ model, projectId: p.id }))
              : [],
          ),
        );
        setUploads(ups);
      } catch (e) {
        if (alive) setError(errMsg(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const attachUpload = (u: Upload) =>
    onToggle({
      key: `file:${u.id}`,
      kind: 'file',
      label: u.filename,
      ref: u.filename,
      fileId: u.id,
      mimetype: u.mimetype,
    });

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const u = await uploadFile(file);
      setUploads((prev) => [u, ...prev]);
      attachUpload(u);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setUploading(false);
    }
  };

  const toggleExpand = async (source: DataSource) => {
    const open = !expanded[source.id];
    setExpanded((prev) => ({ ...prev, [source.id]: open }));
    if (open && !treeByConn[source.id]) {
      try {
        const schemas = await fetchSchemaTree(source.id);
        setTreeByConn((prev) => ({ ...prev, [source.id]: schemas }));
      } catch {
        setTreeByConn((prev) => ({ ...prev, [source.id]: [] }));
      }
    }
  };

  return (
    <>
      <div className={styles.pickerBackdrop} onClick={onClose} />
      <div className={styles.picker} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className={styles.pickerEmpty}>{t.contextPicker.loading}</div>
        ) : error ? (
          <div className={styles.pickerEmpty}>{error}</div>
        ) : (
          <>
            <div className={styles.pickerSection}>
              <div className={styles.pickerSectionTitle}>{t.contextPicker.dataModels}</div>
              {models.length === 0 ? (
                <div className={styles.pickerEmpty}>{t.contextPicker.noModels}</div>
              ) : (
                models.map(({ model: m, projectId }) => {
                  const key = `model:${m.id}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={styles.pickerItem}
                      onClick={() =>
                        onToggle({ key, kind: 'model', label: m.name, ref: m.id, projectId })
                      }
                    >
                      <Icon name="layers" size={14} color="var(--dex-accent)" />
                      <span className={styles.pickerItemLabel}>{m.name}</span>
                      {selected.has(key) ? (
                        <Icon name="tickCircle" size={13} color="var(--dex-success-check)" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            <div className={styles.pickerSection}>
              <div className={styles.pickerSectionTitle}>{t.contextPicker.databasesTables}</div>
              {sources.map((s) => {
                const dsKey = `ds:${s.id}`;
                const open = !!expanded[s.id];
                const tables = (treeByConn[s.id] ?? []).flatMap((sc) => sc.tables);
                return (
                  <div key={s.id}>
                    <div className={styles.pickerDsRow}>
                      <button
                        type="button"
                        className={styles.pickerCaret}
                        onClick={() => void toggleExpand(s)}
                        title={open ? t.contextPicker.collapse : t.contextPicker.expand}
                      >
                        <Icon
                          name="chevronRight"
                          size={11}
                          color="var(--dex-icon-subtle)"
                          style={{
                            transform: `rotate(${open ? 90 : 0}deg)`,
                            transition: 'transform .1s',
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        className={styles.pickerItem}
                        style={{ flex: 1 }}
                        onClick={() =>
                          onToggle({
                            key: dsKey,
                            kind: 'datasource',
                            label: s.name,
                            ref: s.name,
                            sourceId: s.id,
                            dialect: s.dialect,
                            builtin: s.isBuiltin,
                          })
                        }
                      >
                        <Icon name="data" size={14} color="var(--dex-icon)" />
                        <span className={styles.pickerItemLabel}>{s.name}</span>
                        {selected.has(dsKey) ? (
                          <Icon name="tickCircle" size={13} color="var(--dex-success-check)" />
                        ) : null}
                      </button>
                    </div>
                    {open
                      ? tables.map((tbl) => {
                          const tKey = `table:${s.id}:${tbl.name}`;
                          return (
                            <button
                              key={tKey}
                              type="button"
                              className={`${styles.pickerItem} ${styles.pickerTable}`}
                              onClick={() =>
                                onToggle({
                                  key: tKey,
                                  kind: 'table',
                                  label: tbl.name,
                                  ref: tbl.name,
                                  source: s.name,
                                  sourceId: s.id,
                                  dialect: s.dialect,
                                  builtin: s.isBuiltin,
                                })
                              }
                            >
                              <Icon name="table" size={13} color="var(--dex-icon-faint)" />
                              <span className={styles.pickerItemLabel}>{tbl.name}</span>
                              {selected.has(tKey) ? (
                                <Icon
                                  name="tickCircle"
                                  size={13}
                                  color="var(--dex-success-check)"
                                />
                              ) : null}
                            </button>
                          );
                        })
                      : null}
                  </div>
                );
              })}
            </div>

            <div className={styles.pickerSection}>
              <div className={styles.pickerSectionTitle}>{t.contextPicker.files}</div>
              {uploads.map((u) => {
                const key = `file:${u.id}`;
                return (
                  <button
                    key={key}
                    type="button"
                    className={styles.pickerItem}
                    onClick={() => attachUpload(u)}
                  >
                    <Icon name="projects" size={13} color="var(--dex-icon-faint)" />
                    <span className={styles.pickerItemLabel}>{u.filename}</span>
                    {selected.has(key) ? (
                      <Icon name="tickCircle" size={13} color="var(--dex-success-check)" />
                    ) : null}
                  </button>
                );
              })}
              <button
                type="button"
                className={styles.pickerItem}
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <Icon name="plus" size={13} color="var(--dex-accent)" />
                <span className={styles.pickerItemLabel}>
                  {uploading ? t.contextPicker.uploading : t.contextPicker.uploadFile}
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                hidden
                accept=".csv,.txt,.md,.json,.log,.tsv,text/*,image/*,application/json"
                onChange={(e) => void onPickFile(e)}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
