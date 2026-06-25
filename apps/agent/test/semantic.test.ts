import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnly } from '../src/mastra/db/guard';
import { compile, model, runSemanticQuery, validateModel } from '../src/mastra/db/semantic';

// The semantic-layer compiler (v0.4): a known query compiles to read-only SQL,
// the compiled SQL still passes the guard, and it runs against the seeded sample.

test('the built-in model validates with no structural errors', () => {
  assert.deepEqual(validateModel(model), []);
});

test('compile() emits endorsed read-only SQL that passes the guard', () => {
  const compiled = compile({
    measures: ['revenue'],
    dimensions: ['products.category'],
    order: [{ member: 'revenue', direction: 'desc' }],
  });
  assert.match(compiled.sql, /^SELECT/i);
  assert.equal(compiled.endorsed, true);
  assert.doesNotThrow(() => assertReadOnly(compiled.sql));
});

test('revenue by category returns the three seeded categories', async () => {
  const res = await runSemanticQuery({
    measures: ['revenue'],
    dimensions: ['products.category'],
    order: [{ member: 'revenue', direction: 'desc' }],
  });
  assert.ok(res.columns.includes('category'));
  assert.ok(res.columns.includes('revenue'));
  assert.equal(res.rows.length, 3);
});

test('completed_revenue matches the known seeded total', async () => {
  const res = await runSemanticQuery({ measures: ['completed_revenue'] });
  assert.ok(Math.abs(Number(res.rows[0]?.completed_revenue) - 78779.94) < 0.01);
  assert.equal(res.endorsed, true);
});

test('a join-path query (revenue by country, monthly) auto-resolves joins', async () => {
  const res = await runSemanticQuery({
    measures: ['revenue'],
    dimensions: ['customers.country'],
    timeDimension: { dimension: 'orders.order_date', granularity: 'month' },
    limit: 100,
  });
  assert.ok(res.columns.includes('country'));
  assert.ok(res.columns.includes('month'));
  assert.ok(res.rows.length > 0);
});
