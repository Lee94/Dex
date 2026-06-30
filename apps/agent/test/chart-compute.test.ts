import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComputeSql, shapeResult, type ComputeQuery } from '../src/mastra/db/chart-compute';
import type { QueryColumn } from '../src/mastra/db/chart-compute/types';
import type { QueryResult } from '../src/mastra/db/types';

// The compute→SQL translator replaces the in-browser JS aggregation (vinciCompute.ts)
// with SQL pushdown over the chart's base query — aggregation, sorting, filtering,
// time-bucketing, window calcs and pagination. These checks pin the translation so a
// vinci upgrade or a refactor can't silently change the numbers a chart shows.

const dim = (field: string, id = field): QueryColumn => ({ id, field, summary: { type: 0 } });
const measure = (field: string, type: number, id = `${field}:${type}`): QueryColumn => ({
  id,
  field,
  summary: { type },
});
type Leaf = {
  fieldId?: string | null;
  filterType: number;
  filterValue?: unknown;
  filterValueType?: number;
};
const and = (...leaves: Leaf[]) => ({ filterType: 34, filterValue: leaves });
const or = (...leaves: Leaf[]) => ({ filterType: 35, filterValue: leaves });

/* ── aggregation core (unchanged behavior) ───────────────────────────────────── */

test('buildComputeSql: one dimension + summed measure → GROUP BY over the base subquery', () => {
  const q: ComputeQuery = { id: 'q', rows: [dim('category')], values: [measure('revenue', 1)] };
  const { sql, dims, measures } = buildComputeSql('SELECT category, revenue FROM orders', q);
  assert.equal(dims.length, 1);
  assert.equal(measures.length, 1);
  assert.match(
    sql,
    /^SELECT "category" AS c0, COALESCE\(SUM\("revenue"\), 0\) AS c1 FROM \(SELECT category, revenue FROM orders\) AS _dex_base GROUP BY 1 ORDER BY c0$/,
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

test('buildComputeSql: measure-only query → no GROUP BY, no ORDER BY (single total row)', () => {
  const { sql } = buildComputeSql('SELECT revenue FROM orders', {
    id: 'q',
    values: [measure('revenue', 1)],
  });
  assert.match(
    sql,
    /SELECT COALESCE\(SUM\("revenue"\), 0\) AS c0 FROM \(SELECT revenue FROM orders\) AS _dex_base$/,
  );
  assert.doesNotMatch(sql, /GROUP BY|ORDER BY/);
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
  assert.match(sql, /"weird ""name"""/);
});

test('buildComputeSql: rejects a non-read-only base query', () => {
  assert.throws(() =>
    buildComputeSql('DELETE FROM orders', { id: 'q', values: [measure('v', 1)] }),
  );
});

/* ── sorting ──────────────────────────────────────────────────────────────────── */

test('compileSort: ascending/descending on a dimension → ORDER BY its alias', () => {
  const base = 'SELECT category, revenue FROM orders';
  const cols = { rows: [dim('category')], values: [measure('revenue', 1)] };
  const asc = buildComputeSql(base, { id: 'q', ...cols, sort: [{ id: 'category', sortType: 1 }] });
  assert.match(asc.sql, /ORDER BY c0 ASC$/);
  const desc = buildComputeSql(base, { id: 'q', ...cols, sort: [{ id: 'category', sortType: 2 }] });
  assert.match(desc.sql, /ORDER BY c0 DESC$/);
});

test('compileSort: sort a dimension BY a measure (dependField) → ORDER BY the measure alias', () => {
  const { sql } = buildComputeSql('SELECT category, revenue FROM orders', {
    id: 'q',
    rows: [dim('category')],
    values: [measure('revenue', 1)],
    sort: [{ id: 'category', dependField: 'revenue:1', sortType: 2 }],
  });
  assert.match(sql, /ORDER BY c1 DESC$/);
});

test('compileSort: CUSTOM order → CASE over the explicit value sequence', () => {
  const { sql } = buildComputeSql('SELECT category, revenue FROM orders', {
    id: 'q',
    rows: [dim('category')],
    values: [measure('revenue', 1)],
    sort: [{ id: 'category', sortType: 3, values: ['B', 'A'] }],
  });
  assert.match(sql, /ORDER BY CASE c0 WHEN 'B' THEN 0 WHEN 'A' THEN 1 ELSE 2 END$/);
});

test('compileSort: an unknown sort field is skipped with a warning (falls back to default order)', () => {
  const { sql, warnings } = buildComputeSql('SELECT category, revenue FROM orders', {
    id: 'q',
    rows: [dim('category')],
    values: [measure('revenue', 1)],
    sort: [{ id: 'nope', sortType: 2 }],
  });
  assert.match(sql, /ORDER BY c0$/); // default dim order
  assert.ok(warnings.some((w) => /unknown field/.test(w)));
});

/* ── filtering (WHERE on dims, HAVING on measures) ────────────────────────────── */

test('compileFilter: a string filter on a dimension → pre-aggregation WHERE on the raw column', () => {
  const { sql } = buildComputeSql('SELECT region, revenue FROM orders', {
    id: 'q',
    rows: [dim('region')],
    values: [measure('revenue', 1)],
    filter: [
      and({ fieldId: 'region', filterType: 1, filterValue: { type: 1, value: ['A', 'B'] } }),
    ],
  });
  assert.match(sql, /WHERE "region" IN \('A', 'B'\) GROUP BY 1/);
});

test('compileFilter: reverse selection (ValueChooseType.ALL) → NOT IN', () => {
  const { sql } = buildComputeSql('SELECT region, revenue FROM orders', {
    id: 'q',
    rows: [dim('region')],
    values: [measure('revenue', 1)],
    filter: [and({ fieldId: 'region', filterType: 1, filterValue: { type: 2, value: ['A'] } })],
  });
  assert.match(sql, /WHERE "region" NOT IN \('A'\)/);
});

test('compileFilter: a measure filter → post-aggregation HAVING over the aggregate', () => {
  const { sql } = buildComputeSql('SELECT category, revenue FROM orders', {
    id: 'q',
    rows: [dim('category')],
    values: [measure('revenue', 1)],
    filter: [and({ fieldId: 'revenue:1', filterType: 15, filterValue: '1000' })], // NUMBER_LARGE
  });
  assert.match(sql, /GROUP BY 1 HAVING COALESCE\(SUM\("revenue"\), 0\) > 1000/);
});

test('compileFilter: contains → LIKE; between honors open/closed bounds', () => {
  const contain = buildComputeSql('SELECT name, v FROM t', {
    id: 'q',
    rows: [dim('name')],
    values: [measure('v', 1)],
    filter: [and({ fieldId: 'name', filterType: 3, filterValue: 'ab' })], // STRING_CONTAIN
  });
  assert.match(contain.sql, /"name" LIKE '%ab%' ESCAPE '\\'/);
  const between = buildComputeSql('SELECT n, v FROM t', {
    id: 'q',
    rows: [dim('n')],
    values: [measure('v', 1)],
    filter: [
      and({
        fieldId: 'n',
        filterType: 11,
        filterValue: { min: '1', max: '9', closeMin: true, closeMax: false },
      }),
    ],
  });
  assert.match(between.sql, /\("n" >= 1 AND "n" < 9\)/);
});

test('compileFilter: OR combinator joins same-bucket leaves; groups AND together', () => {
  const { sql } = buildComputeSql('SELECT region, revenue FROM orders', {
    id: 'q',
    rows: [dim('region')],
    values: [measure('revenue', 1)],
    filter: [
      or(
        { fieldId: 'region', filterType: 3, filterValue: 'north' },
        { fieldId: 'region', filterType: 3, filterValue: 'south' },
      ),
    ],
  });
  assert.match(
    sql,
    /WHERE \("region" LIKE '%north%' ESCAPE '\\' OR "region" LIKE '%south%' ESCAPE '\\'\)/,
  );
});

test('compileFilter: null/not-null operators; unknown field + parameter value warn and skip', () => {
  const nul = buildComputeSql('SELECT region, v FROM t', {
    id: 'q',
    rows: [dim('region')],
    values: [measure('v', 1)],
    filter: [and({ fieldId: 'region', filterType: 9 })], // STRING_IS_NULL
  });
  assert.match(nul.sql, /WHERE "region" IS NULL/);

  const skipped = buildComputeSql('SELECT region, v FROM t', {
    id: 'q',
    rows: [dim('region')],
    values: [measure('v', 1)],
    filter: [
      and(
        { fieldId: 'ghost', filterType: 3, filterValue: 'x' },
        { fieldId: 'region', filterType: 3, filterValue: 'y', filterValueType: 1 },
      ),
    ],
  });
  assert.doesNotMatch(skipped.sql, /WHERE/);
  assert.ok(skipped.warnings.some((w) => /unknown field/.test(w)));
  assert.ok(skipped.warnings.some((w) => /parameter/.test(w)));
});

test('compileFilter: an empty LIKE value is skipped with a warning (no degenerate %% match)', () => {
  const { sql, warnings } = buildComputeSql('SELECT name, v FROM t', {
    id: 'q',
    rows: [dim('name')],
    values: [measure('v', 1)],
    filter: [and({ fieldId: 'name', filterType: 3, filterValue: '' })], // STRING_CONTAIN, empty
  });
  assert.doesNotMatch(sql, /LIKE|WHERE/);
  assert.ok(warnings.some((w) => /had no value/.test(w)));
});

test('compileFilter: a string value wrapped as { value } is unwrapped', () => {
  const { sql } = buildComputeSql('SELECT name, v FROM t', {
    id: 'q',
    rows: [dim('name')],
    values: [measure('v', 1)],
    filter: [and({ fieldId: 'name', filterType: 3, filterValue: { value: 'ab' } })],
  });
  assert.match(sql, /"name" LIKE '%ab%' ESCAPE '\\'/);
});

/* ── time bucketing (group.type) ──────────────────────────────────────────────── */

test('grain: year-month buckets are dialect-aware (SQLite strftime · Postgres date_trunc)', () => {
  const dateDim: QueryColumn = {
    id: 'd',
    field: 'order_date',
    summary: { type: 0 },
    group: { type: 17 },
  };
  const q: ComputeQuery = { id: 'q', rows: [dateDim], values: [measure('revenue', 1)] };
  const sqlite = buildComputeSql('SELECT order_date, revenue FROM orders', q, 'sqlite');
  assert.match(sqlite.sql, /strftime\('%Y-%m', "order_date"\) AS c0/);
  const pg = buildComputeSql('SELECT order_date, revenue FROM orders', q, 'postgres');
  assert.match(
    pg.sql,
    /to_char\(date_trunc\('month', \("order_date"\)::timestamp\), 'YYYY-MM'\) AS c0/,
  );
});

test('grain: an unsupported grain warns and falls back to the raw value', () => {
  const dateDim: QueryColumn = { id: 'd', field: 'd', summary: { type: 0 }, group: { type: 23 } }; // Y_CYCLE
  const { sql, warnings } = buildComputeSql('SELECT d, v FROM t', {
    id: 'q',
    rows: [dateDim],
    values: [measure('v', 1)],
  });
  assert.match(sql, /SELECT "d" AS c0/);
  assert.ok(warnings.some((w) => /time grain/.test(w)));
});

/* ── window calcs (calculation.type) ──────────────────────────────────────────── */

test('calc: a percent measure wraps the aggregation in an outer window SELECT', () => {
  const m: QueryColumn = {
    id: 'revenue:1',
    field: 'revenue',
    summary: { type: 1 },
    calculation: { type: 12 },
  };
  const { sql } = buildComputeSql('SELECT category, revenue FROM orders', {
    id: 'q',
    rows: [dim('category')],
    values: [m],
  });
  assert.match(
    sql,
    /FROM \(SELECT "category" AS c0, COALESCE\(SUM\("revenue"\), 0\) AS c1 FROM .* GROUP BY 1\) AS _dex_calc/,
  );
  assert.match(sql, /c1 \* 1\.0 \/ NULLIF\(SUM\(c1\) OVER \(\), 0\) AS c1/);
});

test('calc: rank and accumulate emit window functions; accumulate orders by the dims', () => {
  const rank: QueryColumn = {
    id: 'r:1',
    field: 'r',
    summary: { type: 1 },
    calculation: { type: 1302 },
  };
  const r = buildComputeSql('SELECT category, r FROM t', {
    id: 'q',
    rows: [dim('category')],
    values: [rank],
  });
  assert.match(r.sql, /RANK\(\) OVER \(ORDER BY c1 DESC\) AS c1/);

  const acc: QueryColumn = {
    id: 'r:1',
    field: 'r',
    summary: { type: 1 },
    calculation: { type: 14 },
  };
  const a = buildComputeSql('SELECT category, r FROM t', {
    id: 'q',
    rows: [dim('category')],
    values: [acc],
  });
  assert.match(
    a.sql,
    /SUM\(c1\) OVER \(ORDER BY c0 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\) AS c1/,
  );
});

/* ── Top-N + pagination ───────────────────────────────────────────────────────── */

test('Top-N: a NUMBER_TOP_N filter becomes ORDER BY the measure + LIMIT', () => {
  const { sql } = buildComputeSql('SELECT category, revenue FROM orders', {
    id: 'q',
    rows: [dim('category')],
    values: [measure('revenue', 1)],
    filter: [and({ fieldId: 'revenue:1', filterType: 19, filterValue: '5' })],
  });
  assert.match(sql, /GROUP BY 1 ORDER BY c1 DESC LIMIT 5$/);
});

test('Top-N + an explicit sort → cut first, then re-order in an outer wrapper', () => {
  const { sql } = buildComputeSql('SELECT category, revenue FROM orders', {
    id: 'q',
    rows: [dim('category')],
    values: [measure('revenue', 1)],
    filter: [and({ fieldId: 'revenue:1', filterType: 19, filterValue: '5' })],
    sort: [{ id: 'category', sortType: 1 }],
  });
  assert.match(sql, /SELECT \* FROM \(.*ORDER BY c1 DESC LIMIT 5\) AS _dex_topn ORDER BY c0 ASC$/);
});

test('pagination: pageSize/page → LIMIT (pageSize+1, to detect hasNext) + OFFSET', () => {
  const { sql, pageLimit } = buildComputeSql('SELECT category, revenue FROM orders', {
    id: 'q',
    rows: [dim('category')],
    values: [measure('revenue', 1)],
    pageSize: 10,
    page: 2,
  });
  assert.equal(pageLimit, 10);
  assert.match(sql, /ORDER BY c0 LIMIT 11 OFFSET 20$/);
});

/* ── warnings: unsupported aggregate ──────────────────────────────────────────── */

test('warnings: a median/percentile aggregate falls back to SUM and warns', () => {
  const { sql, warnings } = buildComputeSql('SELECT a, v FROM t', {
    id: 'q',
    rows: [dim('a')],
    values: [measure('v', 5)], // MEDIAN → unsupported
  });
  assert.match(sql, /COALESCE\(SUM\("v"\), 0\)/);
  assert.ok(warnings.some((w) => /unsupported aggregation/.test(w)));
});

/* ── result shaping ───────────────────────────────────────────────────────────── */

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
