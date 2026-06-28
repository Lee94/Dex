import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  fetchTableDetail,
  type CubeJoinDef,
  type SemanticModel,
  type SemanticProject,
} from '@/lib/dataSources';
import { useT } from '@/i18n';
import styles from '@/components/data-browser/dataBrowser.module.css';

const RELATIONSHIPS = ['many_to_one', 'one_to_many', 'one_to_one'] as const;

/**
 * A focused, visual relation builder for the Model Studio (v3.4). Picks a target
 * model + relationship + the two columns of the ON condition, then hands a
 * `CubeJoinDef` back. It does NOT submit — the studio merges it into the editor's
 * YAML so it flows through the normal save/validation path. Column dropdowns are
 * fetched from the project's bound source; if that fails, the ON condition falls
 * back to a free-text input (the backend validates it on save either way).
 */
export function AddJoinDialog({
  project,
  self,
  onAdd,
  onClose,
}: {
  project: SemanticProject;
  self: { name: string; baseTable: string };
  onAdd: (join: CubeJoinDef) => void;
  onClose: () => void;
}) {
  const t = useT();
  const targets = useMemo(
    () => (project.models ?? []).filter((m: SemanticModel) => m.id !== self.name),
    [project.models, self.name],
  );

  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [relationship, setRelationship] = useState<(typeof RELATIONSHIPS)[number]>('many_to_one');
  const [selfCols, setSelfCols] = useState<string[] | null>(null);
  const [targetCols, setTargetCols] = useState<string[] | null>(null);
  const [selfCol, setSelfCol] = useState('');
  const [targetCol, setTargetCol] = useState('');
  const [manualSql, setManualSql] = useState('');
  const [error, setError] = useState<string | null>(null);

  const targetModel = targets.find((m) => m.id === targetId);

  // Load this model's columns once.
  useEffect(() => {
    let alive = true;
    if (!self.baseTable) {
      setSelfCols([]);
      return;
    }
    fetchTableDetail(project.sourceId, self.baseTable)
      .then((d) => alive && setSelfCols(d.columns.map((c) => c.name)))
      .catch(() => alive && setSelfCols([]));
    return () => {
      alive = false;
    };
  }, [project.sourceId, self.baseTable]);

  // Load the selected target's columns whenever it changes.
  useEffect(() => {
    let alive = true;
    setTargetCols(null);
    setTargetCol('');
    const table = targetModel?.baseTable;
    if (!table) {
      setTargetCols([]);
      return;
    }
    fetchTableDetail(project.sourceId, table)
      .then((d) => alive && setTargetCols(d.columns.map((c) => c.name)))
      .catch(() => alive && setTargetCols([]));
    return () => {
      alive = false;
    };
  }, [project.sourceId, targetModel?.baseTable]);

  // Column dropdowns only when both sides loaded a non-empty list; else manual.
  const manual = !selfCols?.length || !targetCols?.length;
  const onSql = manual
    ? manualSql.trim()
    : selfCol && targetCol
      ? `${self.name}.${selfCol} = ${targetId}.${targetCol}`
      : '';

  const submit = () => {
    setError(null);
    if (!targetId) {
      setError(t.addJoin.errNeedTarget);
      return;
    }
    if (!onSql) {
      setError(t.addJoin.errNeedCondition);
      return;
    }
    onAdd({ to: targetId, relationship, sql: onSql });
    onClose();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.dialogTitle}>{t.addJoin.title}</h2>

        {targets.length === 0 ? (
          <div className={styles.fieldHint}>{t.addJoin.noTargets}</div>
        ) : (
          <>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t.addJoin.target}</label>
              <select
                className={styles.select}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {targets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t.addJoin.relationship}</label>
              <select
                className={styles.select}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as (typeof RELATIONSHIPS)[number])}
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t.addJoin.on}</label>
              {manual ? (
                <>
                  <input
                    className={styles.input}
                    value={manualSql}
                    placeholder={`${self.name}.id = ${targetId}.${self.name}_id`}
                    onChange={(e) => setManualSql(e.target.value)}
                  />
                  <div className={styles.fieldHint}>{t.addJoin.manualHint}</div>
                </>
              ) : (
                <div className={styles.joinOnRow}>
                  <select
                    className={styles.select}
                    value={selfCol}
                    onChange={(e) => setSelfCol(e.target.value)}
                  >
                    <option value="">{t.addJoin.thisColumn(self.name)}</option>
                    {selfCols!.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className={styles.joinOnEq}>=</span>
                  <select
                    className={styles.select}
                    value={targetCol}
                    onChange={(e) => setTargetCol(e.target.value)}
                  >
                    <option value="">{t.addJoin.targetColumn(targetId)}</option>
                    {targetCols!.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {onSql ? <code className={styles.joinPreview}>{onSql}</code> : null}
            </div>
          </>
        )}

        {error ? <div className={styles.dialogError}>{error}</div> : null}

        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="green" onClick={submit} disabled={targets.length === 0}>
            {t.addJoin.add}
          </Button>
        </div>
      </div>
    </div>
  );
}
