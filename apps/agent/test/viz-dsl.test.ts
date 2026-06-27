import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVizDsl } from '../src/mastra/agents/viz-dsl-validate';
import { createVizCellTool } from '../src/mastra/tools/create-viz-cell';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execTool = (input: unknown, ctx: unknown) => (createVizCellTool as any).execute(input, ctx);

// Pre-flight validator for the visualization specialist's surface DSL. Mirrors the
// web's vendored compiler so a malformed DSL is caught before it's persisted (and
// fed back to the agent to repair). Guards against the regression in trace
// aa2e14def… where `geoms.*.options.sort` slipped through to a broken cell.

// The exact DSL the viz agent authored in that trace.
const badDsl = {
  dslVersion: '1',
  dataVersion: '10.10.0',
  name: 'Top 10 ETF综合评分排名',
  fields: {
    name: { from: 'name', type: 'string' },
    composite_score: { from: 'composite_score', type: 'decimal' },
  },
  encoding: { x: ['name:same'], y: ['composite_score:sum'] },
  geoms: { composite_score: { type: 'interval', options: { sort: 'descending' } } },
  settings: { limit: 10, sort: { field: 'composite_score', order: 'desc' } },
  theme: {},
};

// The repaired DSL: sort moves to the top-level `sort` array, the invalid geom
// option + settings.sort/limit are gone.
const goodDsl = {
  dslVersion: '1',
  dataVersion: '10.10.0',
  name: 'Top 10 ETF综合评分排名',
  fields: {
    name: { from: 'name', type: 'string' },
    composite_score: { from: 'composite_score', type: 'decimal' },
  },
  encoding: { x: ['name:same'], y: ['composite_score:sum'] },
  geoms: { composite_score: { type: 'interval' } },
  sort: [{ id: 'name:same', sortType: 'desc', dependField: 'composite_score:sum' }],
  settings: {},
  theme: {},
};

test('rejects the trace DSL: invalid geom option + settings.sort/limit', () => {
  const problems = validateVizDsl(badDsl);
  assert.ok(problems.length >= 3, `expected several problems, got: ${JSON.stringify(problems)}`);
  assert.ok(
    problems.some((p) => p.includes(`options doesn't support key "sort"`)),
    'should flag the invalid interval option "sort"',
  );
  assert.ok(
    problems.some((p) => p.includes('settings.sort')),
    'should flag settings.sort',
  );
  assert.ok(
    problems.some((p) => p.includes('settings.limit')),
    'should flag settings.limit',
  );
});

test('accepts the repaired DSL (top-level sort, no invalid options)', () => {
  assert.deepEqual(validateVizDsl(goodDsl), []);
});

test('flags an unknown geom type and points away from pie', () => {
  const dsl = { ...goodDsl, geoms: { composite_score: { type: 'pie' } } };
  const problems = validateVizDsl(dsl);
  assert.ok(
    problems.some((p) => p.includes('no "pie" geom')),
    'should reject type "pie"',
  );
});

test('flags a field ref to an undeclared alias', () => {
  const dsl = { ...goodDsl, encoding: { x: ['nope:same'], y: ['composite_score:sum'] } };
  const problems = validateVizDsl(dsl);
  assert.ok(
    problems.some((p) => p.includes('"nope" is not declared')),
    'should reject undeclared alias',
  );
});

test('passes a valid line chart with options (no false positives)', () => {
  const dsl = {
    dslVersion: '1',
    dataVersion: '10.10.0',
    name: 'Monthly revenue',
    fields: {
      order_date: { from: 'order_date', type: 'date' },
      revenue: { from: 'revenue', type: 'number' },
    },
    encoding: { x: [{ field: 'order_date', group: 'y_m' }], y: ['revenue:sum'] },
    geoms: { revenue: { type: 'line', options: { lineType: 'curve', marker: true } } },
    settings: {},
    theme: {},
  };
  assert.deepEqual(validateVizDsl(dsl), []);
});

// create_viz_cell tool — the feedback loop. An invalid DSL must throw (Mastra turns
// the throw into a tool-error fed back to the visualization agent, which repairs and
// retries within its step budget) and must NOT be persisted. No thread context is
// passed, so nothing touches the notebook store.

test('create_viz_cell throws (does not persist) on the trace DSL', async () => {
  await assert.rejects(
    () => execTool({ sourceOutputName: 'etf_ranking_no_money', dsl: badDsl }, {}),
    (err: Error) => {
      assert.match(err.message, /invalid and was not created/);
      assert.match(err.message, /options doesn't support key "sort"/);
      assert.match(err.message, /settings\.limit/);
      return true;
    },
  );
});

test('create_viz_cell accepts the repaired DSL (returns a cellId)', async () => {
  const res = await execTool({ sourceOutputName: 'etf_ranking_no_money', dsl: goodDsl }, {});
  assert.equal(typeof res.cellId, 'string');
  assert.ok(res.cellId.length > 0);
  // No thread context → not persisted, but the DSL passed validation.
  assert.equal(res.persisted, false);
});
