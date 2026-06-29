import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createModel,
  deleteModel,
  listProjectCubes,
  projectCubeNameSet,
} from '../src/mastra/db/semantic';
import type { Cube } from '../src/mastra/db/semantic';
import { proposeCubeTool } from '../src/mastra/tools/propose-cube';

// The join-target catalog + in-run validation that lets the semantic-model
// assistant author joins (v3.x): `listProjectCubes` / `projectCubeNameSet` expose
// a project's other cubes, and `propose_cube` rejects a join to a non-member.

const uid = () => `test_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proposeCube = (input: unknown) => (proposeCubeTool as any).execute(input);

const draftCube = (name: string): Cube => ({
  name,
  title: name,
  sql: 'orders',
  endorsed: false,
  measures: [{ name: 'n_orders', title: 'Orders', type: 'count', format: 'integer' }],
  dimensions: [],
  joins: [],
});

test('listProjectCubes(dex) includes built-in cubes plus the project drafts', async () => {
  const name = uid();
  await deleteModel(name);
  try {
    await createModel(draftCube(name), false, 'dex'); // draft (not published)
    const cubes = await listProjectCubes('dex');
    const names = cubes.map((c) => c.name);
    // Built-in cubes are joinable targets in the dex project…
    assert.ok(names.includes('orders'));
    assert.ok(names.includes('customers'));
    // …and so is a freshly-created draft (the editor can join to a sibling draft).
    assert.ok(names.includes(name));
    const orders = cubes.find((c) => c.name === 'orders');
    assert.equal(orders?.baseTable, 'orders');
  } finally {
    await deleteModel(name);
  }
});

test('projectCubeNameSet excludes the model being edited', async () => {
  const set = await projectCubeNameSet('dex', 'orders');
  assert.ok(set.has('customers'));
  assert.ok(!set.has('orders'));
});

test('propose_cube rejects a join to a model that is not in the project', async () => {
  const name = uid();
  const yaml = [
    `name: ${name}`,
    'sql: orders',
    'measures:',
    '  - name: n_orders',
    '    type: count',
    'joins:',
    '  - to: definitely_not_a_real_cube',
    '    relationship: many_to_one',
    `    sql: ${name}.customer_id = definitely_not_a_real_cube.id`,
  ].join('\n');

  await assert.rejects(
    () => proposeCube({ yaml, projectId: 'dex' }),
    /not a model in this project/,
  );
});

test('propose_cube accepts a join to a real cube in the project', async () => {
  const name = uid();
  const yaml = [
    `name: ${name}`,
    'sql: orders',
    'measures:',
    '  - name: n_orders',
    '    type: count',
    'joins:',
    '  - to: customers',
    '    relationship: many_to_one',
    `    sql: ${name}.customer_id = customers.id`,
  ].join('\n');

  const result = await proposeCube({ yaml, projectId: 'dex' });
  assert.equal(result.cube.name, name);
  assert.equal(result.cube.joins?.[0]?.to, 'customers');
  assert.match(result.yaml, /to: customers/);
});
