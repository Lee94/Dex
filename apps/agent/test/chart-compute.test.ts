import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComputeSql,
  shapeResult,
  type ComputeQuery,
  type QueryColumn,
} from '../src/mastra/db/chart-compute';
import type { QueryResult } from '../src/mastra/db/types';

// The compute→SQL translator replaces the in-browser JS aggregation (vinciCompute.ts)
// with SQL pushdown over the chart's base query. These checks pin the translation so a
// vinci upgrade or a refactor can't silently change the numbers a chart shows.

const dim = (field: string, id = field): QueryColumn => ({ id, field, summary: { type: 0 } });
const measure = (field: string, type: number, id = `${field}:${type}`): QueryColumn => ({
  id,
  field,
  summary: { type },
});

test('buildComputeSql: one dimension + summed measure → GROUP BY over the base subquery', () => {
  const q: ComputeQuery = { id: 'q', rows: [dim('category')], values: [measure('revenue', 1)] };
  const { sql, dims, measures } = buildComputeSql('SELECT category, revenue FROM orders', q);
  assert.equal(dims.length, 1);
  assert.equal(measures.length, 1);
  assert.match(
    sql,
    /^SELECT "category" AS c0, COALESCE\(SUM\("revenue"\), 0\) AS c1 FROM \(SELECT category, revenue FROM orders\) AS _dex_base GROUP BY 1 ORDER BY 1$/,
  );
});

test('buildComputeSql: each summary type maps to its SQL aggregate', () => {
  const cases: Array<[number, RegExp]> = [
    [1, /SUM\("v"\)/], // SUM
    [2, /AVG\("v"\)/], // AVERAGE
    [3, /MAX\("v"\)/], // MAX
    [4, /MIN\("v"\)/], // MIN
    [6, /COUNT\(DISTINCT "v"\)/], // DISTINCT
    [7, /COUNT\(\*\)/], // COUNT
    [99, /SUM\("v"\)/], // unknown → SUM (parity with vinciCompute default)
  ];
  for (const [type, re] of cases) {
    const { sql } = buildComputeSql('SELECT a, v FROM t', {
      id: 'q',
      rows: [dim('a')],
      values: [measure('v', type)],
    });
    assert.match(sql, re, `summary type ${type}`);
  }
});

test('buildComputeSql: measure-only query → no GROUP BY (single total row)', () => {
  const { sql } = buildComputeSql('SELECT revenue FROM orders', {
    id: 'q',
    values: [measure('revenue', 1)],
  });
  assert.match(
    sql,
    /SELECT COALESCE\(SUM\("revenue"\), 0\) AS c0 FROM \(SELECT revenue FROM orders\) AS _dex_base$/,
  );
  assert.doesNotMatch(sql, /GROUP BY/);
});

test('buildComputeSql: trailing semicolon on the base is stripped (stays a single statement)', () => {
  const { sql } = buildComputeSql('SELECT a, v FROM t;', {
    id: 'q',
    rows: [dim('a')],
    values: [measure('v', 1)],
  });
  assert.doesNotMatch(sql, /;/);
});

test('buildComputeSql: quotes identifiers (defends against odd column names)', () => {
  const { sql } = buildComputeSql('SELECT "weird name" AS x, v FROM t', {
    id: 'q',
    rows: [{ id: 'd', field: 'weird "name"', summary: { type: 0 } }],
    values: [measure('v', 1)],
  });
  // Embedded double-quote doubled per SQL identifier rules.
  assert.match(sql, /"weird ""name"""/);
});

test('buildComputeSql: rejects a non-read-only base query', () => {
  assert.throws(() =>
    buildComputeSql('DELETE FROM orders', { id: 'q', values: [measure('v', 1)] }),
  );
});

test('shapeResult: builds vinci columnar output aligned to dims then measures', () => {
  const dims = [dim('category')];
  const measures = [measure('revenue', 1)];
  const qr: QueryResult = {
    columns: ['c0', 'c1'],
    rows: [
      { c0: 'A', c1: 30 },
      { c0: 'B', c1: 70 },
    ],
    rowCount: 2,
    truncated: false,
  };
  const out = shapeResult(dims, measures, qr);
  assert.deepEqual(
    out.fields.map((f) => f.id),
    ['category', 'revenue:1'],
  );
  assert.deepEqual(out.cols, [
    ['A', 'B'],
    ['30', '70'],
  ]);
  assert.equal(out.rowSize, 2);
  assert.equal(out.hasNext, false);
});
