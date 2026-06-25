import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichTableDescription, enrichTableListing } from '../src/mastra/db/catalog';
import type { Metadata } from '../src/mastra/db/metadata';
import type { TableColumns, TableDescription, TableInfo } from '../src/mastra/db/types';

// Pure catalog enrichment (v0.8): surface description + endorsed and drop
// AI-excluded tables/columns. No DB or warehouse needed.

const meta = (p: Partial<Metadata>): Metadata => ({
  description: null,
  status: null,
  categories: [],
  includedForAi: true,
  ...p,
});

const tables: TableInfo[] = [
  { name: 'orders', rowCount: 10 },
  { name: 'secrets', rowCount: 3 },
];
const schema: TableColumns[] = [
  {
    table: 'orders',
    columns: [
      { name: 'id', type: 'INTEGER', notnull: true },
      { name: 'status', type: 'TEXT', notnull: false },
    ],
  },
  { table: 'secrets', columns: [{ name: 'token', type: 'TEXT', notnull: false }] },
];

test('enrichTableListing surfaces description + endorsed and drops excluded tables', () => {
  const out = enrichTableListing(
    tables,
    schema,
    {
      orders: meta({ description: 'Customer orders', status: 'endorsed' }),
      secrets: meta({ includedForAi: false }),
    },
    {},
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'orders');
  assert.equal(out[0].description, 'Customer orders');
  assert.equal(out[0].endorsed, true);
});

test('enrichTableListing drops an AI-excluded column', () => {
  const out = enrichTableListing(
    tables,
    schema,
    {},
    {
      orders: { id: meta({ includedForAi: false }), status: meta({ description: 'Lifecycle' }) },
    },
  );
  const orders = out.find((t) => t.name === 'orders');
  assert.ok(orders);
  assert.deepEqual(
    orders!.columns?.map((c) => c.name),
    ['status'],
  );
  assert.equal(orders!.columns?.[0]?.description, 'Lifecycle');
});

test('enrichTableDescription blocks an AI-excluded table', () => {
  const desc: TableDescription = {
    table: 'secrets',
    columns: [{ name: 'token', type: 'TEXT', notnull: false, primaryKey: false }],
    sampleRows: [],
  };
  const out = enrichTableDescription(desc, meta({ includedForAi: false }), {});
  assert.ok(out.error);
  assert.equal(out.columns, undefined);
});
