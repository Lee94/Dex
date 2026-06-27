import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton } from '@/components/ui';
import {
  fetchSchemaTree,
  fetchTableDetail,
  shortType,
  typeColorVar,
  type ColumnInfo,
  type DimensionKind,
  type MeasureKind,
} from '@/lib/dataSources';
import { useT } from '@/i18n';
import styles from '../dataBrowser.module.css';
import { MEASURE_KINDS, inferDimKind, type GuiMeasureDraft, type GuiModelDraft } from './guiDraft';

/**
 * The GUI tab of the model editor — a controlled, inline version of the old
 * AddModelDialog form (base table → measures + dimensions). It loads the
 * built-in warehouse's tables/columns itself; all model state lives in `value`.
 */
export function ModelGuiForm({
  value,
  onChange,
  readOnly,
}: {
  value: GuiModelDraft;
  onChange: (next: GuiModelDraft) => void;
  readOnly?: boolean;
}) {
  const t = useT();
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);

  const patch = (p: Partial<GuiModelDraft>) => onChange({ ...value, ...p });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const schemas = await fetchSchemaTree('builtin');
        if (alive) setTables(schemas.flatMap((s) => s.tables.map((tbl) => tbl.name)));
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

  // Load the chosen table's columns (for the measure/dimension pickers).
  useEffect(() => {
    if (!value.table) {
      setColumns([]);
      return;
    }
    let alive = true;
    setColumnsLoading(true);
    void (async () => {
      try {
        const detail = await fetchTableDetail('builtin', value.table);
        if (alive) setColumns(detail.columns);
      } catch {
        if (alive) setColumns([]);
      } finally {
        if (alive) setColumnsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [value.table]);

  const numericColumns = useMemo(
    () => columns.filter((c) => inferDimKind(c.type) === 'numeric'),
    [columns],
  );

  const pickTable = (tbl: string) =>
    patch({ table: tbl, name: value.name.trim() ? value.name : tbl });
  const setMeasure = (i: number, mp: Partial<GuiMeasureDraft>) =>
    patch({ measures: value.measures.map((m, idx) => (idx === i ? { ...m, ...mp } : m)) });
  const addMeasure = () =>
    patch({ measures: [...value.measures, { name: '', type: 'sum', column: '' }] });
  const removeMeasure = (i: number) =>
    patch({ measures: value.measures.filter((_, idx) => idx !== i) });
  const toggleDim = (col: string, type: string) => {
    const next = { ...value.dims };
    if (col in next) delete next[col];
    else next[col] = inferDimKind(type);
    patch({ dims: next });
  };

  return (
    <>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t.addModel.baseTable}</label>
        {tablesLoading ? (
          <div className={styles.emptyHint}>{t.addModel.loadingTables}</div>
        ) : tablesError ? (
          <div className={styles.dialogError}>{tablesError}</div>
        ) : (
          <select
            className={styles.select}
            value={value.table}
            disabled={readOnly}
            onChange={(e) => pickTable(e.target.value)}
          >
            <option value="">{t.addModel.selectTable}</option>
            {tables.map((tbl) => (
              <option key={tbl} value={tbl}>
                {tbl}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field} style={{ flex: 1 }}>
          <label className={styles.fieldLabel}>{t.addModel.name}</label>
          <input
            className={styles.input}
            value={value.name}
            placeholder={t.addModel.namePh}
            disabled={readOnly}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
        <div className={styles.field} style={{ flex: 1 }}>
          <label className={styles.fieldLabel}>{t.addModel.titleField}</label>
          <input
            className={styles.input}
            value={value.title}
            placeholder={t.addModel.titlePh}
            disabled={readOnly}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t.addModel.description}</label>
        <input
          className={styles.input}
          value={value.description}
          placeholder={t.addModel.descriptionPh}
          disabled={readOnly}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </div>

      {value.table && columnsLoading ? (
        <div className={styles.emptyHint}>{t.addModel.loadingColumns}</div>
      ) : null}

      {value.table && !columnsLoading ? (
        <>
          <div className={styles.formSection}>
            <div className={styles.formSectionHead}>
              <span className={styles.formSectionTitle}>{t.addModel.measures}</span>
              {readOnly ? null : (
                <button type="button" className={styles.metaAdd} onClick={addMeasure}>
                  <Icon name="plus" size={11} />
                  {t.addModel.addMeasure}
                </button>
              )}
            </div>
            {value.measures.map((m, i) => (
              <div key={i} className={styles.measureRow}>
                <input
                  className={styles.input}
                  style={{ flex: 1, minWidth: 0 }}
                  value={m.name}
                  placeholder={t.addModel.measureNamePh}
                  disabled={readOnly}
                  onChange={(e) => setMeasure(i, { name: e.target.value })}
                />
                <select
                  className={styles.select}
                  style={{ width: 120, flex: 'none' }}
                  value={m.type}
                  disabled={readOnly}
                  onChange={(e) => setMeasure(i, { type: e.target.value as MeasureKind })}
                >
                  {MEASURE_KINDS.map((mt) => (
                    <option key={mt} value={mt}>
                      {t.addModel.measureTypes[mt]}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.select}
                  style={{ width: 130, flex: 'none' }}
                  value={m.column}
                  disabled={readOnly || m.type === 'count'}
                  onChange={(e) => setMeasure(i, { column: e.target.value })}
                >
                  <option value="">
                    {m.type === 'count' ? t.addModel.allRows : t.addModel.columnPh}
                  </option>
                  {(m.type === 'count' || m.type === 'count_distinct'
                    ? columns
                    : numericColumns
                  ).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {readOnly ? null : (
                  <IconButton
                    icon="trash"
                    size={13}
                    color="var(--dex-icon-subtle)"
                    title={t.addModel.removeMeasure}
                    hover="mid"
                    onClick={() => removeMeasure(i)}
                  />
                )}
              </div>
            ))}
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionHead}>
              <span className={styles.formSectionTitle}>{t.addModel.dimensions}</span>
              <span className={styles.emptyHint}>{t.addModel.dimensionsHint}</span>
            </div>
            <div className={styles.dimList}>
              {columns.map((c) => {
                const checked = c.name in value.dims;
                return (
                  <label key={c.name} className={styles.dimRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      onChange={() => toggleDim(c.name, c.type)}
                    />
                    <span className={styles.typeDot} style={{ background: typeColorVar(c.type) }} />
                    <span className={styles.dimRowName}>{c.name}</span>
                    <span className={styles.colType}>{shortType(c.type)}</span>
                    {checked ? (
                      <select
                        className={styles.select}
                        style={{ width: 120, flex: 'none', height: 26 }}
                        value={value.dims[c.name]}
                        disabled={readOnly}
                        onClick={(e) => e.preventDefault()}
                        onChange={(e) =>
                          patch({
                            dims: { ...value.dims, [c.name]: e.target.value as DimensionKind },
                          })
                        }
                      >
                        <option value="categorical">{t.addModel.dimKinds.categorical}</option>
                        <option value="temporal">{t.addModel.dimKinds.temporal}</option>
                        <option value="numeric">{t.addModel.dimKinds.numeric}</option>
                      </select>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
