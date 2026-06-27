import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCubeYaml, cubeToYaml } from '../src/mastra/db/semantic';
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

test('parseCubeYaml rejects joins', () => {
  const yaml =
    'name: c\nsql: products\nmeasures:\n  - name: n\n    type: count\njoins:\n  - to: orders\n    relationship: many_to_one\n    sql: c.order_id = orders.id\n';
  const { errors } = parseCubeYaml(yaml);
  assert.ok(errors.some((e) => /joins/i.test(e.message)));
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
