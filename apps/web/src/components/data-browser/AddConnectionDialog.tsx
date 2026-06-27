import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { type ConnectorKind, type NewConnectionInput } from '@/lib/dataSources';
import { useT } from '@/i18n';
import styles from './dataBrowser.module.css';

/** Modal for registering a new read-only data source (Postgres / SQLite). */
export function AddConnectionDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: NewConnectionInput) => Promise<unknown>;
}) {
  const [type, setType] = useState<ConnectorKind>('postgres');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [schema, setSchema] = useState('public');
  const [ssl, setSsl] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t.addConnection.errNeedName);
      return;
    }
    const input: NewConnectionInput =
      type === 'sqlite'
        ? { name: name.trim(), type: 'sqlite', filePath: filePath.trim() }
        : {
            name: name.trim(),
            type: 'postgres',
            host: host.trim() || undefined,
            port: port ? Number(port) : undefined,
            database: database.trim() || undefined,
            user: user.trim() || undefined,
            password: password || undefined,
            schema: schema.trim() || undefined,
            ssl,
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
        <h2 className={styles.dialogTitle}>{t.addConnection.title}</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t.addConnection.name}</label>
          <input
            className={styles.input}
            value={name}
            placeholder={t.addConnection.namePh}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t.addConnection.type}</label>
          <select
            className={styles.select}
            value={type}
            onChange={(e) => setType(e.target.value as ConnectorKind)}
          >
            <option value="postgres">Postgres</option>
            <option value="sqlite">SQLite</option>
          </select>
        </div>

        {type === 'sqlite' ? (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t.addConnection.filePath}</label>
            <input
              className={styles.input}
              value={filePath}
              placeholder={t.addConnection.filePathPh}
              onChange={(e) => setFilePath(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className={styles.fieldRow}>
              <div className={styles.field} style={{ flex: 2 }}>
                <label className={styles.fieldLabel}>{t.addConnection.host}</label>
                <input
                  className={styles.input}
                  value={host}
                  placeholder={t.addConnection.hostPh}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>{t.addConnection.port}</label>
                <input
                  className={styles.input}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t.addConnection.database}</label>
              <input
                className={styles.input}
                value={database}
                placeholder={t.addConnection.databasePh}
                onChange={(e) => setDatabase(e.target.value)}
              />
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>{t.addConnection.user}</label>
                <input
                  className={styles.input}
                  value={user}
                  placeholder={t.addConnection.userPh}
                  onChange={(e) => setUser(e.target.value)}
                />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>{t.addConnection.password}</label>
                <input
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>{t.addConnection.schema}</label>
                <input
                  className={styles.input}
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                />
              </div>
              <div
                className={styles.field}
                style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}
              >
                <label
                  className={styles.fieldLabel}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}
                >
                  <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />
                  {t.addConnection.requireTls}
                </label>
              </div>
            </div>
          </>
        )}

        {error ? <div className={styles.dialogError}>{error}</div> : null}

        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button variant="green" onClick={() => void submit()} disabled={busy}>
            {busy ? t.addConnection.connecting : t.addConnection.testAdd}
          </Button>
        </div>
      </div>
    </div>
  );
}
