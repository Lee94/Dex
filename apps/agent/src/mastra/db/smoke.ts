import { assertReadOnly, describeTable, listTables, runReadOnlySql } from './queries';

/**
 * Non-LLM smoke test: exercises the warehouse query helpers (the same logic the
 * agent's tools call) so we can verify the data layer end-to-end without an
 * Anthropic API key. Run with: `npm run smoke`
 */
async function main(): Promise<void> {
  let failures = 0;
  const check = (label: string, ok: boolean, detail?: unknown) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) {
      failures++;
      if (detail !== undefined) console.log('      ', detail);
    }
  };

  // 1. list_tables
  const tables = await listTables();
  const names = tables.map((t) => t.name).sort();
  check(
    'list_tables returns the 4 seeded tables',
    JSON.stringify(names) === JSON.stringify(['customers', 'order_items', 'orders', 'products']),
    names,
  );
  check('orders table is populated', (tables.find((t) => t.name === 'orders')?.rowCount ?? 0) > 0);

  // 2. describe_table
  const desc = await describeTable('order_items');
  const colNames = desc.columns.map((c) => c.name);
  check(
    'describe_table(order_items) returns expected columns',
    ['id', 'order_id', 'product_id', 'quantity', 'unit_price'].every((c) => colNames.includes(c)),
    colNames,
  );
  check('describe_table returns sample rows', desc.sampleRows.length > 0);

  // 3. run_sql — a realistic analytical query (top products by completed revenue)
  const topProducts = await runReadOnlySql(`
    SELECT p.name, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.status = 'completed'
    GROUP BY p.id
    ORDER BY revenue DESC
    LIMIT 5
  `);
  check(
    'run_sql returns ranked products',
    topProducts.rows.length === 5 && topProducts.columns.includes('revenue'),
    topProducts.rows,
  );
  console.log('      top products by revenue:', topProducts.rows);

  // 4. read-only guard rejects writes
  for (const bad of [
    'DELETE FROM orders',
    'DROP TABLE products',
    'SELECT 1; DROP TABLE products',
  ]) {
    let rejected = false;
    try {
      assertReadOnly(bad);
    } catch {
      rejected = true;
    }
    check(`read-only guard rejects: ${bad}`, rejected);
  }
  // ...and allows a normal SELECT
  let allowed = true;
  try {
    assertReadOnly('SELECT * FROM products');
  } catch {
    allowed = false;
  }
  check('read-only guard allows a SELECT', allowed);

  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
