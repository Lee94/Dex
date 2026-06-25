import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton, Pill } from '@/components/ui';
import {
  type AlertOp,
  type DeliveryChannel,
  type Task,
  createTask,
  deleteTask,
  listTasks,
  runTaskNow,
  updateTask,
} from '@/lib/tasks';
import styles from './tasks.module.css';

const STATUS_TONE: Record<string, 'success' | 'danger' | 'beta'> = {
  ok: 'success',
  alert: 'beta',
  error: 'danger',
};

/**
 * Scheduled tasks surface (v1.3). Create a read-only query to re-run on a cron,
 * with an optional alert + delivery; enable/disable, run now, delete, and see the
 * last run. Reachable from the sidebar "Tasks". Re-runs go through the agent's
 * read-only path server-side.
 */
export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await listTasks());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <Icon name="tasks" size={18} color="var(--dex-primary)" />
        <span className={styles.headTitle}>Tasks</span>
        <span className={styles.headSub}>
          Re-run a read-only query on a schedule — alert on a threshold, deliver a summary.
        </span>
      </div>
      <div className={styles.body}>
        <NewTaskForm onCreated={refresh} />
        {error ? <div className={styles.error}>{error}</div> : null}
        {tasks.length === 0 ? (
          <div className={styles.empty}>
            <Icon name="tasks" size={22} color="var(--dex-icon-faint)" />
            <span>No scheduled tasks yet. Create one above.</span>
          </div>
        ) : (
          <div className={styles.list}>
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewTaskForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [cron, setCron] = useState('0 9 * * 1-5');
  const [sql, setSql] = useState('');
  const [op, setOp] = useState<AlertOp | ''>('');
  const [threshold, setThreshold] = useState('');
  const [channel, setChannel] = useState<DeliveryChannel>('none');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await createTask({
        name,
        cron,
        sql,
        alert: op ? { op, threshold: threshold ? Number(threshold) : undefined } : null,
        delivery: { channel, url: url || undefined },
      });
      setName('');
      setSql('');
      setOp('');
      setThreshold('');
      setChannel('none');
      setUrl('');
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.form}>
      <span className={styles.formTitle}>New scheduled task</span>
      <div className={styles.row}>
        <div className={styles.field} style={{ flex: 2 }}>
          <span className={styles.fieldLabel}>Name</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Daily completed revenue"
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Cron</span>
          <input
            className={styles.input}
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 9 * * 1-5"
          />
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Read-only SQL</span>
        <textarea
          className={`${styles.input} ${styles.sqlInput}`}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="SELECT SUM(quantity * unit_price) AS revenue FROM order_items"
        />
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Alert</span>
          <select
            className={styles.select}
            value={op}
            onChange={(e) => setOp(e.target.value as AlertOp | '')}
          >
            <option value="">No alert</option>
            <option value="gt">value &gt; threshold</option>
            <option value="lt">value &lt; threshold</option>
            <option value="ne">value ≠ threshold</option>
            <option value="changed">value changed</option>
          </select>
        </div>
        {op && op !== 'changed' ? (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Threshold</span>
            <input
              className={styles.input}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="1000"
            />
          </div>
        ) : null}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Deliver to</span>
          <select
            className={styles.select}
            value={channel}
            onChange={(e) => setChannel(e.target.value as DeliveryChannel)}
          >
            <option value="none">Don't deliver</option>
            <option value="slack">Slack webhook</option>
            <option value="webhook">Generic webhook</option>
          </select>
        </div>
        {channel !== 'none' ? (
          <div className={styles.field} style={{ flex: 2 }}>
            <span className={styles.fieldLabel}>Webhook URL</span>
            <input
              className={styles.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/…"
            />
          </div>
        ) : null}
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.formActions}>
        <Button
          variant="green"
          onClick={() => void submit()}
          disabled={busy || !name.trim() || !sql.trim()}
        >
          {busy ? 'Creating…' : 'Schedule task'}
        </Button>
        <span className={styles.hint}>cron: minute hour day month weekday</span>
      </div>
    </div>
  );
}

function TaskCard({ task, onChanged }: { task: Task; onChanged: () => Promise<void> }) {
  const [running, setRunning] = useState(false);

  const toggle = async () => {
    await updateTask(task.id, { enabled: !task.enabled });
    await onChanged();
  };
  const run = async () => {
    setRunning(true);
    try {
      await runTaskNow(task.id);
      await onChanged();
    } finally {
      setRunning(false);
    }
  };
  const remove = async () => {
    await deleteTask(task.id);
    await onChanged();
  };

  const lastRun = task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : 'never';

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <span className={styles.cardName}>{task.name}</span>
        <span className={styles.cron}>{task.cron}</span>
        {task.lastStatus ? (
          <Pill tone={STATUS_TONE[task.lastStatus] ?? 'beta'}>{task.lastStatus}</Pill>
        ) : null}
        <button
          className={`${styles.toggle}${task.enabled ? ` ${styles.toggleOn}` : ''}`}
          onClick={() => void toggle()}
        >
          {task.enabled ? 'Enabled' : 'Disabled'}
        </button>
        <button className={styles.runBtn} onClick={() => void run()} disabled={running}>
          {running ? 'Running…' : 'Run now'}
        </button>
        <IconButton
          icon="trash"
          size={14}
          color="var(--dex-icon)"
          title="Delete task"
          hover="mid"
          onClick={() => void remove()}
        />
      </div>
      {task.sql ? <div className={styles.sql}>{task.sql}</div> : null}
      <div className={styles.meta}>
        <span>Last run: {lastRun}</span>
        {task.lastValue != null ? <span>Value: {task.lastValue.toLocaleString()}</span> : null}
        {task.alert ? (
          <span>
            Alert: {task.alert.op}
            {task.alert.threshold != null ? ` ${task.alert.threshold}` : ''}
          </span>
        ) : null}
        {task.delivery.channel !== 'none' ? <span>→ {task.delivery.channel}</span> : null}
        {task.lastError ? <span className={styles.error}>{task.lastError}</span> : null}
      </div>
    </div>
  );
}
