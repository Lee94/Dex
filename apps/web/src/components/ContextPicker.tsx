import { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  fetchSchemaTree,
  fetchSemanticProject,
  listDataSources,
  type DataSource,
  type SchemaNode,
  type SemanticModel,
} from '@/lib/dataSources';
import type { Attachment } from '@/lib/attachments';
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
  const [models, setModels] = useState<SemanticModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [treeByConn, setTreeByConn] = useState<Record<string, SchemaNode[]>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [srcs, project] = await Promise.all([
          listDataSources(),
          fetchSemanticProject('dex').catch(() => null),
        ]);
        if (!alive) return;
        setSources(srcs);
        setModels(project?.models ?? []);
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
          <div className={styles.pickerEmpty}>Loading…</div>
        ) : error ? (
          <div className={styles.pickerEmpty}>{error}</div>
        ) : (
          <>
            <div className={styles.pickerSection}>
              <div className={styles.pickerSectionTitle}>Data models</div>
              {models.length === 0 ? (
                <div className={styles.pickerEmpty}>No models yet.</div>
              ) : (
                models.map((m) => {
                  const key = `model:${m.id}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={styles.pickerItem}
                      onClick={() => onToggle({ key, kind: 'model', label: m.name, ref: m.id })}
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
              <div className={styles.pickerSectionTitle}>Databases & tables</div>
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
                        title={open ? 'Collapse' : 'Expand'}
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
                      ? tables.map((t) => {
                          const tKey = `table:${s.id}:${t.name}`;
                          return (
                            <button
                              key={tKey}
                              type="button"
                              className={`${styles.pickerItem} ${styles.pickerTable}`}
                              onClick={() =>
                                onToggle({
                                  key: tKey,
                                  kind: 'table',
                                  label: t.name,
                                  ref: t.name,
                                  source: s.name,
                                  sourceId: s.id,
                                  dialect: s.dialect,
                                  builtin: s.isBuiltin,
                                })
                              }
                            >
                              <Icon name="table" size={13} color="var(--dex-icon-faint)" />
                              <span className={styles.pickerItemLabel}>{t.name}</span>
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
          </>
        )}
      </div>
    </>
  );
}
