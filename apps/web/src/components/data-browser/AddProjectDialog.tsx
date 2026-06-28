import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { type DataSource, type NewProjectInput } from '@/lib/dataSources';
import { useT } from '@/i18n';
import styles from './dataBrowser.module.css';

/** Modal for creating a semantic project bound to a data connection (v3.3). */
export function AddProjectDialog({
  sources,
  onClose,
  onSubmit,
}: {
  sources: DataSource[];
  onClose: () => void;
  onSubmit: (input: NewProjectInput) => Promise<unknown>;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? 'builtin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t.addProject.errNeedName);
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        sourceId,
      });
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
        <h2 className={styles.dialogTitle}>{t.addProject.title}</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t.addProject.name}</label>
          <input
            className={styles.input}
            value={name}
            placeholder={t.addProject.namePh}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t.addProject.description}</label>
          <input
            className={styles.input}
            value={description}
            placeholder={t.addProject.descriptionPh}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t.addProject.source}</label>
          <select
            className={styles.select}
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className={styles.fieldHint}>{t.addProject.sourceHint}</div>
        </div>

        {error ? <div className={styles.dialogError}>{error}</div> : null}

        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button variant="green" onClick={() => void submit()} disabled={busy}>
            {busy ? t.addProject.creating : t.addProject.create}
          </Button>
        </div>
      </div>
    </div>
  );
}
