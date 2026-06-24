import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import {
  fetchSchemaTree,
  fetchTableDetail,
  shortType,
  typeColorVar,
  type ColumnInfo,
  type DimensionKind,
  type MeasureKind,
  type NewModelInput,
} from '@/lib/dataSources';
import styles from './dataBrowser.module.css';

const MEASURE_TYPES: MeasureKind[] = ['count', 'sum', 'avg', 'count_distinct', 'min', 'max'];

interface MeasureDraft {
  name: string;
  type: MeasureKind;
  column: string;
}

/** Infer a dimension kind from a SQL column type (overridable in the form). */
function inferDimKind(type: string): DimensionKind {
  const t = type.toLowerCase();
  if (/(date|time|timestamp)/.test(t)) return 'temporal';
  if (/(int|real|numeric|decimal|double|float|serial|money)/.test(t)) return 'numeric';
  return 'categorical';
}

/**
 * Modal for adding a user-defined semantic model (a cube) over a table in the
 * agent's warehouse. Pick a base table, then choose measures (aggregations) and
 * dimensions (groupable attributes); the backend compiles + validates it.
 */
export function AddModelDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: NewModelInput) => Promise<unknown>;
}) {
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [table, setTable] = useState('');

  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [measures, setMeasures] = useState<MeasureDraft[]>([
    { name: 'count', type: 'count', column: '' },
  ]);
  const [dims, setDims] = useState<Record<string, DimensionKind>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the agent (builtin) source's tables to populate the base-table picker.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const schemas = await fetchSchemaTree('builtin');
        if (!alive) return;
        setTables(schemas.flatMap((s) => s.tables.map((t) => t.name)));
      } catch (e) {
        if (alive) setTablesError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setTablesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // When the base table changes, load its columns and reset the member pickers.
  useEffect(() => {
    if (!table) {
      setColumns([]);
      setDims({});
      return;
    }
    let alive = true;
    setColumnsLoading(true);
    void (async () => {
      try {
        const detail = await fetchTableDetail('builtin', table);
        if (!alive) return;
        setColumns(detail.columns);
        setDims({});
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setColumnsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [table]);

  const numericColumns = useMemo(
    () => columns.filter((c) => inferDimKind(c.type) === 'numeric'),
    [columns],
  );

  const pickTable = (t: string) => {
    setTable(t);
    if (!name.trim()) setName(t); // suggest the table name as the model name
  };

  const setMeasure = (i: number, patch: Partial<MeasureDraft>) =>
    setMeasures((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const addMeasure = () => setMeasures((prev) => [...prev, { name: '', type: 'sum', column: '' }]);
  const removeMeasure = (i: number) => setMeasures((prev) => prev.filter((_, idx) => idx !== i));

  const toggleDim = (col: string, type: string) =>
    setDims((prev) => {
      const next = { ...prev };
      if (col in next) delete next[col];
      else next[col] = inferDimKind(type);
      return next;
    });

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the model a name.');
    if (!table) return setError('Pick a base table.');
    const cleanMeasures = measures
      .map((m) => ({ ...m, name: m.name.trim() }))
      .filter((m) => m.name);
    if (cleanMeasures.length === 0) return setError('Add at least one measure.');
    for (const m of cleanMeasures) {
      if (m.type !== 'count' && !m.column) {
        return setError(`Measure "${m.name}" (${m.type}) needs a column.`);
      }
    }

    const input: NewModelInput = {
      name: name.trim(),
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      table,
      measures: cleanMeasures.map((m) => ({
        name: m.name,
        type: m.type,
        column: m.type === 'count' ? undefined : m.column,
      })),
      dimensions: Object.entries(dims).map(([column, type]) => ({ name: column, column, type })),
    };

    setBusy(true);
    try {
      await onSubmit(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.dialogTitle}>New data model</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Base table</label>
          {tablesLoading ? (
            <div className={styles.emptyHint}>Loading tables…</div>
          ) : tablesError ? (
            <div className={styles.dialogError}>{tablesError}</div>
          ) : (
            <select
              className={styles.select}
              value={table}
              onChange={(e) => pickTable(e.target.value)}
            >
              <option value="">Select a table…</option>
              {tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.fieldLabel}>Name</label>
            <input
              className={styles.input}
              value={name}
              placeholder="order_items"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.fieldLabel}>Title</label>
            <input
              className={styles.input}
              value={title}
              placeholder="Order line items"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Description</label>
          <input
            className={styles.input}
            value={description}
            placeholder="What this model represents…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {table && columnsLoading ? <div className={styles.emptyHint}>Loading columns…</div> : null}

        {table && !columnsLoading ? (
          <>
            <div className={styles.formSection}>
              <div className={styles.formSectionHead}>
                <span className={styles.formSectionTitle}>Measures</span>
                <button type="button" className={styles.metaAdd} onClick={addMeasure}>
                  <Icon name="plus" size={11} />
                  Add measure
                </button>
              </div>
              {measures.map((m, i) => (
                <div key={i} className={styles.measureRow}>
                  <input
                    className={styles.input}
                    style={{ flex: 1, minWidth: 0 }}
                    value={m.name}
                    placeholder="name"
                    onChange={(e) => setMeasure(i, { name: e.target.value })}
                  />
                  <select
                    className={styles.select}
                    style={{ width: 120, flex: 'none' }}
                    value={m.type}
                    onChange={(e) => setMeasure(i, { type: e.target.value as MeasureKind })}
                  >
                    {MEASURE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.select}
                    style={{ width: 130, flex: 'none' }}
                    value={m.column}
                    disabled={m.type === 'count'}
                    onChange={(e) => setMeasure(i, { column: e.target.value })}
                  >
                    <option value="">{m.type === 'count' ? '— (all rows)' : 'column…'}</option>
                    {(m.type === 'count' || m.type === 'count_distinct'
                      ? columns
                      : numericColumns
                    ).map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <IconButton
                    icon="trash"
                    size={13}
                    color="var(--dex-icon-subtle)"
                    title="Remove measure"
                    hover="mid"
                    onClick={() => removeMeasure(i)}
                  />
                </div>
              ))}
            </div>

            <div className={styles.formSection}>
              <div className={styles.formSectionHead}>
                <span className={styles.formSectionTitle}>Dimensions</span>
                <span className={styles.emptyHint}>Columns to group by</span>
              </div>
              <div className={styles.dimList}>
                {columns.map((c) => {
                  const checked = c.name in dims;
                  return (
                    <label key={c.name} className={styles.dimRow}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDim(c.name, c.type)}
                      />
                      <span
                        className={styles.typeDot}
                        style={{ background: typeColorVar(c.type) }}
                      />
                      <span className={styles.dimRowName}>{c.name}</span>
                      <span className={styles.colType}>{shortType(c.type)}</span>
                      {checked ? (
                        <select
                          className={styles.select}
                          style={{ width: 120, flex: 'none', height: 26 }}
                          value={dims[c.name]}
                          onClick={(e) => e.preventDefault()}
                          onChange={(e) =>
                            setDims((prev) => ({
                              ...prev,
                              [c.name]: e.target.value as DimensionKind,
                            }))
                          }
                        >
                          <option value="categorical">categorical</option>
                          <option value="temporal">temporal</option>
                          <option value="numeric">numeric</option>
                        </select>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        {error ? <div className={styles.dialogError}>{error}</div> : null}

        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="green" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Creating…' : 'Create model'}
          </Button>
        </div>
      </div>
    </div>
  );
}
