import test from 'node:test';
import assert from 'node:assert/strict';
import { cronMatches, isValidCron } from '../src/mastra/db/cron';
import { createTask, deleteTask, getTask, listTasks, updateTask } from '../src/mastra/db/tasks';
import { evaluateAlert, extractScalar, runTask } from '../src/mastra/db/task-runner';
import { setDeliverer, type DeliveryMessage } from '../src/mastra/db/delivery';
import {
  deleteThreadSummary,
  getThreadSummary,
  upsertThreadSummary,
} from '../src/mastra/db/thread-summaries';
import type { QueryResult } from '../src/mastra/db/types';

// Scheduling & alerts (v1.3): cron matching, task CRUD, read-only re-run +
// alerting via a mock deliverer, and past-thread-summary recall.

test('isValidCron accepts standard expressions and rejects junk', () => {
  assert.ok(isValidCron('0 9 * * 1-5'));
  assert.ok(isValidCron('*/15 * * * *'));
  assert.ok(!isValidCron('0 9 * *')); // 4 fields
  assert.ok(!isValidCron('99 * * * *')); // out of range
});

test('cronMatches matches the right minute', () => {
  const at = new Date('2026-06-25T09:00:00'); // local time; Thursday
  assert.ok(cronMatches('0 9 * * *', at));
  assert.ok(!cronMatches('30 9 * * *', at));
  assert.ok(cronMatches('*/15 * * * *', new Date('2026-06-25T09:15:00')));
  assert.ok(!cronMatches('*/15 * * * *', new Date('2026-06-25T09:07:00')));
});

test('extractScalar reads a named column, else the first numeric cell', () => {
  const r: QueryResult = {
    columns: ['label', 'n'],
    rows: [{ label: 'x', n: 42 }],
    rowCount: 1,
    truncated: false,
  };
  assert.equal(extractScalar(r, 'n'), 42);
  assert.equal(extractScalar(r), 42);
  assert.equal(extractScalar({ columns: [], rows: [], rowCount: 0, truncated: false }), null);
});

test('evaluateAlert covers gt / lt / ne / changed', () => {
  assert.equal(evaluateAlert({ op: 'gt', threshold: 10 }, 11, null), true);
  assert.equal(evaluateAlert({ op: 'lt', threshold: 10 }, 11, null), false);
  assert.equal(evaluateAlert({ op: 'ne', threshold: 10 }, 11, null), true);
  assert.equal(evaluateAlert({ op: 'changed' }, 11, 10), true);
  assert.equal(evaluateAlert({ op: 'changed' }, 10, 10), false);
  assert.equal(evaluateAlert(null, 11, null), false);
});

test('task CRUD round-trips and toggles enabled', async () => {
  const task = await createTask({
    name: 'Smoke task',
    kind: 'sql',
    sql: 'SELECT COUNT(*) AS n FROM products',
    cron: '0 9 * * *',
  });
  try {
    const fetched = await getTask(task.id);
    assert.equal(fetched?.name, 'Smoke task');
    assert.equal(fetched?.enabled, true);
    const disabled = await updateTask(task.id, { enabled: false });
    assert.equal(disabled?.enabled, false);
    assert.ok((await listTasks()).some((t) => t.id === task.id));
  } finally {
    await deleteTask(task.id);
  }
  assert.equal(await getTask(task.id), null);
});

test('runTask executes read-only, fires an alert, and delivers via the seam', async () => {
  const delivered: DeliveryMessage[] = [];
  setDeliverer({
    async deliver(_d, message) {
      delivered.push(message);
    },
  });
  // products has > 1 row in the seed, so "> 0" alerts.
  const task = await createTask({
    name: 'Product count alert',
    kind: 'sql',
    sql: 'SELECT COUNT(*) AS n FROM products',
    cron: '0 9 * * *',
    alert: { op: 'gt', threshold: 0 },
    delivery: { channel: 'webhook', url: 'https://example.com/hook' },
  });
  try {
    const run = await runTask(task);
    assert.equal(run.status, 'alert');
    assert.ok(run.value !== null && run.value > 0);
    assert.equal(run.alertFired, true);
    assert.equal(delivered.length, 1);
    assert.match(delivered[0].text, /ALERT/);
    // The run was recorded on the task.
    const after = await getTask(task.id);
    assert.equal(after?.lastStatus, 'alert');
  } finally {
    setDeliverer(null);
    await deleteTask(task.id);
  }
});

test('a task with bad SQL records an error run instead of throwing', async () => {
  const task = await createTask({
    name: 'Bad task',
    kind: 'sql',
    sql: 'SELECT * FROM no_such_table',
    cron: '0 9 * * *',
  });
  try {
    const run = await runTask(task);
    assert.equal(run.status, 'error');
    assert.ok(run.error);
  } finally {
    await deleteTask(task.id);
  }
});

test('thread summaries upsert and recall', async () => {
  const id = '__test_thread__';
  await upsertThreadSummary(id, { title: 'Revenue dig', summary: 'Found Q1 revenue up 12%.' });
  try {
    const s = await getThreadSummary(id);
    assert.equal(s?.title, 'Revenue dig');
    assert.match(s?.summary ?? '', /12%/);
    // upsert overwrites
    await upsertThreadSummary(id, { title: 'Revenue dig', summary: 'Updated.' });
    assert.equal((await getThreadSummary(id))?.summary, 'Updated.');
  } finally {
    await deleteThreadSummary(id);
  }
});
