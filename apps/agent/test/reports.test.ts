import test from 'node:test';
import assert from 'node:assert/strict';
import { createPin, deletePin, listPins, reorderPins } from '../src/mastra/db/reports';

// Pins & reports persistence (v3.4): pin results/charts out of a thread, list in
// order, reorder, and delete. Uses the shared dex.db like the other store tests.

test('pins append in order, reorder, and delete', async () => {
  const threadId = `t-${Math.random().toString(36).slice(2)}`;
  const a = await createPin({
    threadId,
    kind: 'table',
    title: 'Revenue',
    payload: { columns: ['n'], rows: [{ n: 1 }], rowCount: 1, truncated: false },
  });
  const b = await createPin({
    threadId,
    kind: 'chart',
    title: 'Trend',
    payload: { dsl: { chartType: 'line' }, label: 'Trend' },
  });
  try {
    let pins = await listPins(threadId);
    assert.equal(pins.length, 2);
    assert.deepEqual(
      pins.map((p) => p.id),
      [a.id, b.id],
    );
    assert.equal(pins[0].position, 0);
    assert.equal(pins[1].position, 1);
    assert.equal(pins[1].kind, 'chart');
    // payload round-trips
    assert.deepEqual(pins[0].payload, {
      columns: ['n'],
      rows: [{ n: 1 }],
      rowCount: 1,
      truncated: false,
    });

    // reorder b before a
    pins = await reorderPins(threadId, [b.id, a.id]);
    assert.deepEqual(
      pins.map((p) => p.id),
      [b.id, a.id],
    );
  } finally {
    assert.equal(await deletePin(a.id), true);
    assert.equal(await deletePin(b.id), true);
  }
  assert.equal((await listPins(threadId)).length, 0);
});

test('deletePin returns false for an unknown id', async () => {
  assert.equal(await deletePin('does-not-exist'), false);
});
