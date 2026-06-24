import {
  assertReadOnly,
  describeTable,
  getActiveProvider,
  getConnector,
  listTables,
  runReadOnlySql,
} from './queries';
import { PostgresConnector } from './connectors/postgres';
import {
  compile,
  createUserCube,
  deleteUserCube,
  describeModelSummaryAsync,
  loadMergedModel,
  model,
  runSemanticQuery,
  validateModel,
} from './semantic';
import { createConnectorFromConfig, getConnectorById } from './connector';
import { WAREHOUSE_PATH } from './warehouse';
import { getTableMetadata, upsertTableMetadata, deleteMetadataForDatasource } from './metadata';

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

  // 0. connector interface — SQLite is the no-setup default
  const connector = getConnector();
  check(
    'active provider defaults to sqlite (no Postgres configured)',
    getActiveProvider() === 'sqlite' && connector.dialect === 'sqlite',
    { provider: getActiveProvider(), dialect: connector.dialect, label: connector.label },
  );

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

  // 5. semantic layer (v0.4) — model validation, compiler, join resolution, exec
  const modelErrors = validateModel(model);
  check('semantic model validates (no structural errors)', modelErrors.length === 0, modelErrors);

  const compiled = compile({
    measures: ['revenue'],
    dimensions: ['products.category'],
    order: [{ member: 'revenue', direction: 'desc' }],
  });
  check(
    'compiler emits endorsed read-only SQL (revenue by category)',
    /^SELECT/i.test(compiled.sql) && compiled.endorsed === true,
    compiled.sql,
  );
  let compiledGuardOk = true;
  try {
    assertReadOnly(compiled.sql);
  } catch {
    compiledGuardOk = false;
  }
  check('compiled semantic SQL passes assertReadOnly', compiledGuardOk);

  const revByCat = await runSemanticQuery({
    measures: ['revenue'],
    dimensions: ['products.category'],
    order: [{ member: 'revenue', direction: 'desc' }],
  });
  check(
    'query_semantic: revenue by category returns 3 categories',
    revByCat.columns.includes('category') &&
      revByCat.columns.includes('revenue') &&
      revByCat.rows.length === 3,
    revByCat.rows,
  );
  console.log('      revenue by category:', revByCat.rows);

  // The completed_revenue metric must match the seed's known total.
  const completed = await runSemanticQuery({ measures: ['completed_revenue'] });
  const completedVal = Number(completed.rows[0]?.completed_revenue);
  check(
    'query_semantic: completed_revenue matches seeded total (78779.94)',
    Math.abs(completedVal - 78779.94) < 0.01 && completed.endorsed === true,
    { completedVal, endorsed: completed.endorsed, sql: completed.sql },
  );

  // Join resolution through a bridge cube: order_items → orders → customers.
  const monthlyByCountry = await runSemanticQuery({
    measures: ['revenue'],
    dimensions: ['customers.country'],
    timeDimension: { dimension: 'orders.order_date', granularity: 'month' },
    limit: 100,
  });
  check(
    'query_semantic: monthly revenue by country auto-resolves joins',
    monthlyByCountry.columns.includes('country') &&
      monthlyByCountry.columns.includes('month') &&
      monthlyByCountry.rows.length > 0,
    { columns: monthlyByCountry.columns, rows: monthlyByCountry.rows.length },
  );

  // 5b. data-source module (v0.6) — connector factory, registry, metadata overlay
  const factory = createConnectorFromConfig({
    id: '__smoke__',
    name: 'smoke sqlite',
    type: 'sqlite',
    filePath: WAREHOUSE_PATH,
    createdAt: 0,
  });
  try {
    const factoryTables = (await factory.listTables()).map((t) => t.name).sort();
    check(
      'createConnectorFromConfig(sqlite) lists the seeded tables',
      JSON.stringify(factoryTables) ===
        JSON.stringify(['customers', 'order_items', 'orders', 'products']),
      factoryTables,
    );
  } finally {
    await factory.close();
  }

  const builtin = await getConnectorById('builtin');
  check(
    "getConnectorById('builtin') matches the active connector",
    builtin === getConnector() && builtin.dialect === getActiveProvider(),
    { dialect: builtin.dialect },
  );

  // metadata overlay: upsert → read back → cleanup (uses a throwaway datasource id)
  const SMOKE_DS = '__smoke__';
  await deleteMetadataForDatasource(SMOKE_DS);
  await upsertTableMetadata(SMOKE_DS, 'orders', {
    description: 'Customer orders',
    status: 'endorsed',
    includedForAi: false,
  });
  const readBack = await getTableMetadata(SMOKE_DS, 'orders');
  check(
    'metadata upsert persists and reads back',
    readBack.description === 'Customer orders' &&
      readBack.status === 'endorsed' &&
      readBack.includedForAi === false,
    readBack,
  );
  // patch merge: changing one field keeps the others
  await upsertTableMetadata(SMOKE_DS, 'orders', { description: 'Updated' });
  const merged = await getTableMetadata(SMOKE_DS, 'orders');
  check(
    'metadata patch merges (status preserved)',
    merged.description === 'Updated' && merged.status === 'endorsed',
    merged,
  );
  await deleteMetadataForDatasource(SMOKE_DS);

  // preview path: capped SELECT * through the read-only guard
  const preview = await runReadOnlySql('SELECT * FROM orders LIMIT 5', 5);
  check(
    'preview-style capped query returns rows',
    preview.rows.length === 5 && preview.columns.length > 0,
    { rows: preview.rows.length, cols: preview.columns.length },
  );

  // 5c. user-defined semantic models (v0.7) — create → merge → query → delete
  const SMOKE_CUBE = 'smoke_products';
  await deleteUserCube(SMOKE_CUBE); // clean any leftover from a prior run
  await createUserCube('products', {
    name: SMOKE_CUBE,
    title: 'Smoke products',
    description: 'Throwaway user cube over products.',
    sql: 'products',
    endorsed: false,
    measures: [
      { name: 'product_total', title: 'Product total', type: 'count', format: 'integer' },
      {
        name: 'avg_price',
        title: 'Average price',
        type: 'avg',
        sql: `${SMOKE_CUBE}.price`,
        format: 'number',
      },
    ],
    dimensions: [
      { name: 'category', title: 'Category', type: 'categorical', sql: `${SMOKE_CUBE}.category` },
    ],
    joins: [],
  });

  const mergedModel = await loadMergedModel();
  check(
    'user cube appears in the merged model',
    mergedModel.cubes.some((cc) => cc.name === SMOKE_CUBE),
    mergedModel.cubes.map((cc) => cc.name),
  );

  const mergedSummary = await describeModelSummaryAsync();
  check(
    'describeModelSummaryAsync includes the user cube',
    mergedSummary.cubes.some((cc) => cc.name === SMOKE_CUBE),
  );

  const userQuery = await runSemanticQuery({
    measures: [`${SMOKE_CUBE}.avg_price`],
    dimensions: [`${SMOKE_CUBE}.category`],
  });
  check(
    'query_semantic runs against a user cube (avg price by category)',
    userQuery.columns.includes('category') &&
      userQuery.columns.includes('avg_price') &&
      userQuery.rows.length === 3 &&
      userQuery.endorsed === false,
    userQuery.rows,
  );

  const deleted = await deleteUserCube(SMOKE_CUBE);
  const afterDelete = await loadMergedModel();
  check(
    'deleting a user cube removes it from the merged model',
    deleted && !afterDelete.cubes.some((cc) => cc.name === SMOKE_CUBE),
  );

  // 6. Postgres connector — only when a connection is configured; otherwise skip
  // so the SQLite path stays the no-setup default.
  const pgConfigured =
    !!process.env.DATABASE_URL || !!process.env.PG_CONNECTION_STRING || !!process.env.PGHOST;
  if (pgConfigured) {
    const pg = new PostgresConnector();
    try {
      const pgTables = await pg.listTables();
      check('postgres connector lists tables', Array.isArray(pgTables), pgTables);
      if (pgTables.length > 0) {
        const desc = await pg.describeTable(pgTables[0].name);
        check('postgres connector describes a table', desc.columns.length > 0, desc.columns);
        const probe = await pg.runReadOnlySql('SELECT 1 AS one');
        check('postgres connector runs a read-only query', probe.rows[0]?.one === 1, probe.rows);
      }
    } catch (err) {
      check('postgres connector reachable', false, err instanceof Error ? err.message : err);
    } finally {
      await pg.close();
    }
  } else {
    console.log('SKIP  postgres connector (no DATABASE_URL / PGHOST configured)');
  }

  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
