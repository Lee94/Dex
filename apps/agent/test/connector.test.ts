import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeTable,
  getActiveProvider,
  getConnector,
  listTables,
  runReadOnlySql,
  tableColumns,
} from '../src/mastra/db/queries';

// The connector interface (v0.3) against the freshly-seeded SQLite sample — the
// no-setup default path. `npm run seed` runs first (pretest).

const SEEDED = ['customers', 'order_items', 'orders', 'products'];

test('active provider defaults to sqlite', () => {
  assert.equal(getActiveProvider(), 'sqlite');
  assert.equal(getConnector().dialect, 'sqlite');
});

test('listTables returns the seeded tables with row counts', async () => {
  const tables = await listTables();
  assert.deepEqual(tables.map((t) => t.name).sort(), SEEDED);
  assert.ok((tables.find((t) => t.name === 'orders')?.rowCount ?? 0) > 0);
});

test('describeTable returns columns + sample rows', async () => {
  const desc = await describeTable('order_items');
  const cols = desc.columns.map((c) => c.name);
  for (const c of ['id', 'order_id', 'product_id', 'quantity', 'unit_price']) {
    assert.ok(cols.includes(c), `missing column ${c}`);
  }
  assert.ok(desc.sampleRows.length > 0);
});

test('tableColumns returns columns for every table in one call', async () => {
  const all = await tableColumns();
  assert.equal(all.length, 4);
  const subset = await tableColumns(['products']);
  assert.equal(subset.length, 1);
  assert.equal(subset[0]?.table, 'products');
});

test('runReadOnlySql runs an analytical query', async () => {
  const res = await runReadOnlySql(`
    SELECT p.name, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.status = 'completed'
    GROUP BY p.id ORDER BY revenue DESC LIMIT 5
  `);
  assert.equal(res.rows.length, 5);
  assert.ok(res.columns.includes('revenue'));
});

test('runReadOnlySql refuses a write through the guard', async () => {
  await assert.rejects(() => runReadOnlySql('DELETE FROM orders'));
});
