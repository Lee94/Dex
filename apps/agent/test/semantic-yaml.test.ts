import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCubeYaml,
  cubeToYaml,
  validateJoins,
  assertJoinsValid,
} from '../src/mastra/db/semantic';
import type { Cube } from '../src/mastra/db/semantic';

// cube.js-style YAML (v3.1): parse + serialize round-trip and rejection of
// malformed / disallowed input. Pure functions — no DB / seed needed.

test('cubeToYaml → parseCubeYaml round-trips a standalone cube', () => {
  const cube: Cube = {
    name: 'order_items',
    title: 'Order line items',
    description: 'Revenue fact table.',
    sql: 'order_items',
    endorsed: false,
    measures: [
      {
        name: 'revenue',
        title: 'Revenue',
        type: 'sum',
        sql: 'order_items.quantity * order_items.unit_price',
        format: 'currency',
      },
      { name: 'line_items', title: 'Line items', type: 'count', format: 'integer' },
    ],
    dimensions: [
      { name: 'category', title: 'Category', type: 'categorical', sql: 'order_items.category' },
    ],
    joins: [],
  };
  const { cube: parsed, errors } = parseCubeYaml(cubeToYaml(cube));
  assert.deepEqual(errors, []);
  assert.ok(parsed);
  assert.equal(parsed!.name, 'order_items');
  assert.equal(parsed!.endorsed, false);
  assert.deepEqual(parsed!.joins, []);
  assert.equal(parsed!.measures.length, 2);
  assert.equal(
    parsed!.measures.find((m) => m.name === 'revenue')?.sql,
    'order_items.quantity * order_items.unit_price',
  );
  assert.equal(parsed!.dimensions.length, 1);
});

test('parseCubeYaml accepts a minimal cube and forces endorsed=false / joins=[]', () => {
  const { cube, errors } = parseCubeYaml(
    'name: my_cube\nsql: products\nmeasures:\n  - name: n\n    type: count\n',
  );
  assert.deepEqual(errors, []);
  assert.equal(cube!.endorsed, false);
  assert.deepEqual(cube!.joins, []);
});

test('parseCubeYaml reports a YAML syntax error', () => {
  const { cube, errors } = parseCubeYaml('name: "unterminated string');
  assert.equal(cube, undefined);
  assert.ok(errors.length > 0);
});

test('parseCubeYaml rejects a non-identifier name', () => {
  const { errors } = parseCubeYaml(
    'name: "bad name"\nsql: products\nmeasures:\n  - name: n\n    type: count\n',
  );
  assert.ok(errors.some((e) => /name must be an identifier/i.test(e.message)));
});

test('parseCubeYaml rejects a non-count measure missing sql (via validateModel)', () => {
  const { cube, errors } = parseCubeYaml(
    'name: c\nsql: products\nmeasures:\n  - name: total\n    type: sum\n',
  );
  assert.equal(cube, undefined);
  assert.ok(errors.length > 0);
});

test('parseCubeYaml accepts a well-formed join (target existence deferred to the route)', () => {
  const yaml =
    'name: c\nsql: order_items\nmeasures:\n  - name: n\n    type: count\njoins:\n  - to: orders\n    relationship: many_to_one\n    sql: c.order_id = orders.id\n';
  const { cube, errors } = parseCubeYaml(yaml);
  assert.deepEqual(errors, []);
  assert.equal(cube!.joins?.length, 1);
  assert.equal(cube!.joins?.[0].to, 'orders');
  assert.equal(cube!.joins?.[0].relationship, 'many_to_one');
});

test('cubeToYaml → parseCubeYaml round-trips a cube with joins', () => {
  const cube: Cube = {
    name: 'c',
    sql: 'order_items',
    endorsed: false,
    measures: [{ name: 'n', type: 'count', format: 'integer' }],
    dimensions: [],
    joins: [{ to: 'orders', relationship: 'many_to_one', sql: 'c.order_id = orders.id' }],
  };
  const { cube: parsed, errors } = parseCubeYaml(cubeToYaml(cube));
  assert.deepEqual(errors, []);
  assert.deepEqual(parsed!.joins, cube.joins);
});

test('parseCubeYaml rejects a join with a bad relationship', () => {
  const yaml =
    'name: c\nsql: order_items\nmeasures:\n  - name: n\n    type: count\njoins:\n  - to: orders\n    relationship: sideways\n    sql: c.order_id = orders.id\n';
  const { errors } = parseCubeYaml(yaml);
  assert.ok(errors.some((e) => /relationship must be one of/i.test(e.message)));
});

test('parseCubeYaml rejects a join missing its ON sql', () => {
  const yaml =
    'name: c\nsql: order_items\nmeasures:\n  - name: n\n    type: count\njoins:\n  - to: orders\n    relationship: many_to_one\n';
  const { errors } = parseCubeYaml(yaml);
  assert.ok(errors.some((e) => /sql .*required/i.test(e.message)));
});

test('parseCubeYaml rejects a join whose sql does not reference both cubes', () => {
  const yaml =
    'name: c\nsql: order_items\nmeasures:\n  - name: n\n    type: count\njoins:\n  - to: orders\n    relationship: many_to_one\n    sql: c.order_id = c.id\n';
  const { errors } = parseCubeYaml(yaml);
  assert.ok(errors.some((e) => /must reference both/i.test(e.message)));
});

test('validateJoins flags an unknown target cube and a missing owning column', () => {
  const cube: Cube = {
    name: 'c',
    sql: 'order_items',
    endorsed: false,
    measures: [{ name: 'n', type: 'count', format: 'integer' }],
    dimensions: [],
    joins: [{ to: 'orders', relationship: 'many_to_one', sql: 'c.order_id = orders.id' }],
  };
  // Target not in the project → error; owning column `order_id` not in the table → error.
  const errs = validateJoins(cube, {
    ownColumns: new Set(['id', 'product_id']),
    knownCubeNames: new Set(['products']),
  });
  assert.ok(errs.some((e) => /not a model in this project/i.test(e)));
  assert.ok(errs.some((e) => /does not exist/i.test(e)));
  // With the right context it passes.
  assert.deepEqual(
    validateJoins(cube, {
      ownColumns: new Set(['order_id', 'id']),
      knownCubeNames: new Set(['orders']),
    }),
    [],
  );
});

test('assertJoinsValid throws on a self-referential join', () => {
  const cube: Cube = {
    name: 'c',
    sql: 'order_items',
    endorsed: false,
    measures: [{ name: 'n', type: 'count', format: 'integer' }],
    dimensions: [],
    joins: [{ to: 'c', relationship: 'many_to_one', sql: 'c.order_id = c.id' }],
  };
  assert.throws(
    () => assertJoinsValid(cube, new Set(['order_id', 'id']), new Set(['c'])),
    /itself/i,
  );
});

test('parseCubeYaml rejects an unknown measure type', () => {
  const { errors } = parseCubeYaml(
    'name: c\nsql: products\nmeasures:\n  - name: n\n    type: median\n',
  );
  assert.ok(errors.some((e) => /type must be one of/i.test(e.message)));
});

test('parseCubeYaml rejects a non-mapping top level', () => {
  const { cube, errors } = parseCubeYaml('- just\n- a\n- list');
  assert.equal(cube, undefined);
  assert.ok(errors.length > 0);
});
