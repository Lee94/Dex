import {
  assertReadOnly,
  describeTable,
  getActiveProvider,
  getConnector,
  listTables,
  runReadOnlySql,
  tableColumns,
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
import { createConnectorFromConfig, getBuiltinDataSource, getConnectorById } from './connector';
import { WAREHOUSE_PATH } from './warehouse';
import { getTableMetadata, upsertTableMetadata, deleteMetadataForDatasource } from './metadata';
import type { Metadata } from './metadata';
import { enrichTableDescription, enrichTableListing } from './catalog';
import { currentDatetime } from '../tools/get-current-datetime';
import { createGuide, deleteGuide, getGuide, listGuides, updateGuide } from './guides';
import { deleteMemoriesForResource, deleteMemory, listMemories, saveMemory } from './memories';
import { createReviewRequest, deleteReviewRequest, listReviewRequests } from './reviews';
import { setWebProvider, webSearch, type WebProvider } from '../web';
import { deleteUpload, readFileContents, saveUpload } from './uploads';
import {
  appendCell,
  createNotebook,
  deleteNotebook,
  getNotebook,
  listNotebooks,
  updateNotebook,
} from './notebooks';
import { resolveChainedSql } from './notebook-exec';

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

  // 2b. tableColumns — cheap bulk schema (powers the enriched list_tables)
  const allCols = await tableColumns();
  const oiCols = allCols.find((t) => t.table === 'order_items')?.columns.map((c) => c.name) ?? [];
  check(
    'tableColumns() returns columns for every table in one call',
    allCols.length === 4 &&
      ['id', 'order_id', 'product_id', 'quantity', 'unit_price'].every((c) => oiCols.includes(c)),
    { tables: allCols.length, order_items: oiCols },
  );
  const subset = await tableColumns(['products']);
  check(
    'tableColumns([table]) filters to the requested table',
    subset.length === 1 && subset[0]?.table === 'products' && subset[0].columns.length > 0,
    subset,
  );

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

  // 5b-2. catalog-aware discovery (v0.8) — the pure enrichment over real
  // connector output, driven by fabricated metadata (no DB writes needed).
  const m = (p: Partial<Metadata>): Metadata => ({
    description: null,
    status: null,
    categories: [],
    includedForAi: true,
    ...p,
  });
  const realTables = await listTables();
  const realSchema = await tableColumns();
  const tableMetaFix = {
    orders: m({ description: 'Customer orders', status: 'endorsed' }),
    order_items: m({ includedForAi: false }),
  };
  const columnMetaFix = {
    orders: {
      status: m({ description: 'Order lifecycle status' }),
      id: m({ includedForAi: false }),
    },
  };
  const enriched = enrichTableListing(realTables, realSchema, tableMetaFix, columnMetaFix);
  const ordersEntry = enriched.find((t) => t.name === 'orders');
  check(
    'list_tables enrichment surfaces curated description + endorsed',
    ordersEntry?.description === 'Customer orders' && ordersEntry?.endorsed === true,
    ordersEntry,
  );
  check(
    'list_tables enrichment omits an AI-excluded table',
    !enriched.some((t) => t.name === 'order_items'),
    enriched.map((t) => t.name),
  );
  check(
    'list_tables enrichment omits an AI-excluded column',
    !!ordersEntry && !(ordersEntry.columns ?? []).some((c) => c.name === 'id'),
    ordersEntry?.columns?.map((c) => c.name),
  );

  const ordersDesc = await describeTable('orders');
  const describedOrders = enrichTableDescription(
    ordersDesc,
    tableMetaFix.orders,
    columnMetaFix.orders,
  );
  check(
    'describe_table enrichment surfaces a curated column description',
    (describedOrders.columns ?? []).find((c) => c.name === 'status')?.description ===
      'Order lifecycle status',
    describedOrders.columns,
  );
  const oiDesc = await describeTable('order_items');
  const describedOi = enrichTableDescription(oiDesc, tableMetaFix.order_items, {});
  check(
    'describe_table enrichment blocks an AI-excluded table',
    describedOi.error != null,
    describedOi,
  );

  // list_datasources building block: the env source projected as `builtin`.
  const builtinSource = getBuiltinDataSource();
  check(
    'getBuiltinDataSource reports the primary warehouse',
    builtinSource.id === 'builtin' && builtinSource.isAgentSource && !!builtinSource.dialect,
    builtinSource,
  );

  // get_current_datetime formatter is deterministic for a fixed instant.
  const fixed = currentDatetime(new Date('2026-06-25T14:30:00.000Z'));
  check(
    'get_current_datetime formats a fixed instant',
    /^\d{4}-\d{2}-\d{2}$/.test(fixed.date) &&
      fixed.iso === '2026-06-25T14:30:00.000Z' &&
      fixed.unixMs === Date.parse('2026-06-25T14:30:00.000Z'),
    fixed,
  );

  // 5b-3. knowledge & memory (v0.9) — guides + memories + review requests CRUD.
  // The starter guide is seeded on first schema use.
  const seededGuides = await listGuides();
  check(
    'a starter guide is seeded on a fresh dex.db',
    seededGuides.some((g) => g.slug === 'revenue-definitions'),
    seededGuides.map((g) => g.slug),
  );

  const guide = await createGuide({
    title: 'Smoke guide — units',
    content: 'Report revenue in **thousands** unless asked otherwise.',
    tags: ['smoke', 'units'],
  });
  try {
    const fetchedGuide = await getGuide(guide.slug);
    check(
      'read_guide fetches a guide by slug with its content',
      fetchedGuide?.title === 'Smoke guide — units' && fetchedGuide.content.includes('thousands'),
      fetchedGuide,
    );
    const editedGuide = await updateGuide(guide.id, { content: 'Report revenue in dollars.' });
    check(
      'a guide can be edited (content replaced)',
      editedGuide?.content === 'Report revenue in dollars.' && editedGuide.slug === guide.slug,
      editedGuide,
    );
  } finally {
    await deleteGuide(guide.id);
  }
  check('deleting a guide removes it', (await getGuide(guide.slug)) === null);

  // Memory: save → recall (the cross-thread persistence the agent reads) → dedupe → forget.
  const SMOKE_RES = '__smoke_resource__';
  await deleteMemoriesForResource(SMOKE_RES);
  const mem = await saveMemory('Fiscal year starts in February.', SMOKE_RES);
  const recalled = await listMemories(SMOKE_RES);
  check(
    'save_memory persists a preference that recalls across threads',
    recalled.length === 1 && recalled[0]?.content === 'Fiscal year starts in February.',
    recalled,
  );
  const dup = await saveMemory('Fiscal year starts in February.', SMOKE_RES);
  check(
    'save_memory is idempotent on identical content',
    dup.id === mem.id && (await listMemories(SMOKE_RES)).length === 1,
  );
  await deleteMemory(mem.id);
  check('a memory can be forgotten', (await listMemories(SMOKE_RES)).length === 0);

  // 5b-4. external context (v1.1) — web via a mock provider + file reading.
  const mockWeb: WebProvider = {
    name: 'mock',
    configured: true,
    async search(query, limit) {
      return Array.from({ length: limit }, (_, i) => ({
        title: `R${i} ${query}`,
        url: `https://example.com/${i}`,
        snippet: 's',
      }));
    },
    async extract(url) {
      return { url, title: 'Example', content: 'body' };
    },
  };
  setWebProvider(mockWeb);
  try {
    const search = await webSearch('benchmarks', 2);
    check(
      'search_web returns untrusted results from the provider',
      search.configured === true && 'results' in search && search.results.length === 2,
      search,
    );
  } finally {
    setWebProvider(null);
  }

  const upText = await saveUpload({
    filename: 'm.csv',
    mimetype: 'text/csv',
    contentBase64: Buffer.from('country,n\nUS,1\nUK,2', 'utf8').toString('base64'),
  });
  try {
    const fc = await readFileContents(upText.id);
    check(
      'get_file_contents parses an uploaded CSV',
      fc?.kind === 'csv' && fc.rowCount === 2 && fc.columns[0] === 'country',
      fc,
    );
  } finally {
    await deleteUpload(upText.id);
  }

  // Review requests: suggest_review persists an open request.
  const review = await createReviewRequest({
    question: 'Which revenue definition applies here?',
    reason: 'Two plausible readings: gross vs. completed.',
  });
  try {
    const reviews = await listReviewRequests();
    check(
      'suggest_review persists an open review request',
      reviews.some((r) => r.id === review.id && r.status === 'open'),
      review,
    );
  } finally {
    await deleteReviewRequest(review.id);
  }
  check(
    'a review request can be cleared',
    !(await listReviewRequests()).some((r) => r.id === review.id),
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

  // 5d. notebooks (v2.0) — create → get → update (cells) → list → delete
  const createdNotebook = await createNotebook('Smoke notebook', [
    { id: 'c1', kind: 'sql', source: 'SELECT 1 AS one' },
  ]);
  try {
    const fetchedNotebook = await getNotebook(createdNotebook.id);
    check(
      'notebook create + get round-trips one SQL cell',
      fetchedNotebook?.title === 'Smoke notebook' &&
        fetchedNotebook?.cells.length === 1 &&
        fetchedNotebook?.cells[0]?.source === 'SELECT 1 AS one',
      fetchedNotebook,
    );

    const updatedNotebook = await updateNotebook(createdNotebook.id, {
      title: 'Smoke notebook (edited)',
      cells: [
        { id: 'c1', kind: 'sql', source: 'SELECT 2 AS two' },
        { id: 'c2', kind: 'sql', source: 'SELECT COUNT(*) AS n FROM products' },
      ],
    });
    check(
      'notebook update replaces title + cells atomically',
      updatedNotebook?.title === 'Smoke notebook (edited)' &&
        updatedNotebook?.cells.length === 2 &&
        updatedNotebook?.cells[1]?.source === 'SELECT COUNT(*) AS n FROM products',
      updatedNotebook,
    );

    // A partial patch (title only) must leave the cells untouched.
    const titleOnly = await updateNotebook(createdNotebook.id, {
      title: 'Smoke notebook (retitled)',
    });
    check(
      'notebook update with title-only patch preserves cells',
      titleOnly?.title === 'Smoke notebook (retitled)' && titleOnly?.cells.length === 2,
      titleOnly,
    );

    const notebookList = await listNotebooks();
    const listedNotebook = notebookList.find((n) => n.id === createdNotebook.id);
    check(
      'listNotebooks returns a summary with the cell count',
      listedNotebook?.cellCount === 2 && listedNotebook?.title === 'Smoke notebook (retitled)',
      listedNotebook,
    );

    // A cell's SQL runs through the same read-only connector path the route uses.
    const cellResult = await runReadOnlySql('SELECT COUNT(*) AS n FROM products');
    check(
      'notebook cell SQL executes via the read-only connector',
      Number(cellResult.rows[0]?.n) > 0,
      cellResult.rows,
    );
  } finally {
    // Always clean up, even if an assertion above threw — keeps dex.db tidy.
    await deleteNotebook(createdNotebook.id);
  }
  check(
    'deleting a notebook removes it from the list',
    !(await listNotebooks()).some((n) => n.id === createdNotebook.id),
  );

  // 5e. notebook cell chaining (v2.0) — outputName → CTE flattening + cycle guard
  const chainCells = [
    {
      id: 'A',
      kind: 'sql' as const,
      source: 'SELECT category, price FROM products',
      outputName: 'base_products',
    },
    {
      id: 'B',
      kind: 'sql' as const,
      source: 'SELECT category, COUNT(*) AS n FROM base_products GROUP BY category',
      outputName: 'by_cat',
    },
  ];
  const composedChain = resolveChainedSql(chainCells, 'B');
  check(
    'resolveChainedSql inlines an upstream cell as a CTE',
    /WITH\s+base_products\s+AS/i.test(composedChain),
    composedChain,
  );
  const chainResult = await runReadOnlySql(composedChain);
  check(
    'chained cell SQL runs (count by category over an upstream cell)',
    chainResult.columns.includes('category') &&
      chainResult.columns.includes('n') &&
      chainResult.rows.length === 3,
    chainResult.rows,
  );

  let cycleRejected = false;
  try {
    resolveChainedSql(
      [
        { id: 'X', kind: 'sql', source: 'SELECT * FROM y_out', outputName: 'x_out' },
        { id: 'Y', kind: 'sql', source: 'SELECT * FROM x_out', outputName: 'y_out' },
      ],
      'X',
    );
  } catch {
    cycleRejected = true;
  }
  check('resolveChainedSql rejects a circular cell reference', cycleRejected);

  // appendCell: create-on-first-append, then positioned insert
  const SMOKE_NB = '__smoke_nb__';
  await deleteNotebook(SMOKE_NB);
  try {
    await appendCell(
      SMOKE_NB,
      { id: 'n1', kind: 'sql', source: 'SELECT 1' },
      { titleIfNew: 'Append test' },
    );
    const afterAppend = await appendCell(
      SMOKE_NB,
      { id: 'n2', kind: 'sql', source: 'SELECT 2' },
      { afterCellId: 'n1' },
    );
    check(
      'appendCell creates the notebook then appends in order',
      afterAppend.cells.length === 2 &&
        afterAppend.cells[0]?.id === 'n1' &&
        afterAppend.cells[1]?.id === 'n2',
      afterAppend.cells.map((cc) => cc.id),
    );
  } finally {
    await deleteNotebook(SMOKE_NB);
  }

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
