import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createModel,
  deleteModel,
  loadMergedModel,
  runSemanticQuery,
} from '../src/mastra/db/semantic';
import type { Cube } from '../src/mastra/db/semantic';

// User-defined joins (v3.4): a published user cube may declare a join to a
// built-in cube; the merged model then auto-resolves it and a semantic query
// spanning the join compiles + runs against the seeded warehouse.

const uid = () => `test_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

test('a published user cube joined to a built-in cube is queryable across the join', async () => {
  const name = uid();
  const cube: Cube = {
    name,
    title: name,
    sql: 'orders', // base table — aliased AS the cube name
    endorsed: false,
    measures: [{ name: 'n_orders', title: 'Orders', type: 'count', format: 'integer' }],
    dimensions: [],
    joins: [
      { to: 'customers', relationship: 'many_to_one', sql: `${name}.customer_id = customers.id` },
    ],
  };

  await deleteModel(name);
  try {
    await createModel(cube, true, 'dex'); // publish straight away

    // The merged model now contains the user cube (with its join).
    const merged = await loadMergedModel();
    assert.ok(merged.cubes.some((c) => c.name === name));

    // A query that uses the user cube's measure + a built-in cube's dimension
    // forces the declared join to resolve.
    const res = await runSemanticQuery({
      measures: [`${name}.n_orders`],
      dimensions: ['customers.country'],
      limit: 100,
    });
    assert.ok(res.columns.includes('country'));
    assert.ok(res.columns.includes('n_orders'));
    assert.ok(res.rows.length > 0);
  } finally {
    await deleteModel(name);
  }
});
