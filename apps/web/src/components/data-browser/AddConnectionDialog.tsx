import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { type ConnectorKind, type NewConnectionInput } from '@/lib/dataSources';
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

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Give the connection a name.');
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
        <h2 className={styles.dialogTitle}>Add data connection</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Name</label>
          <input
            className={styles.input}
            value={name}
            placeholder="Production warehouse"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Type</label>
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
            <label className={styles.fieldLabel}>File path</label>
            <input
              className={styles.input}
              value={filePath}
              placeholder="/path/to/warehouse.db"
              onChange={(e) => setFilePath(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className={styles.fieldRow}>
              <div className={styles.field} style={{ flex: 2 }}>
                <label className={styles.fieldLabel}>Host</label>
                <input
                  className={styles.input}
                  value={host}
                  placeholder="db.example.com"
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>Port</label>
                <input
                  className={styles.input}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Database</label>
              <input
                className={styles.input}
                value={database}
                placeholder="analytics"
                onChange={(e) => setDatabase(e.target.value)}
              />
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>User</label>
                <input
                  className={styles.input}
                  value={user}
                  placeholder="readonly"
                  onChange={(e) => setUser(e.target.value)}
                />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>Password</label>
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
                <label className={styles.fieldLabel}>Schema</label>
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
                  Require TLS
                </label>
              </div>
            </div>
          </>
        )}

        {error ? <div className={styles.dialogError}>{error}</div> : null}

        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="green" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Connecting…' : 'Test & add'}
          </Button>
        </div>
      </div>
    </div>
  );
}
