/**
 * Chart-compute shared types + the `@vinci/core` enum tables this module translates.
 *
 * The web forwards the vinci viewer's `compute(queries)` payload **verbatim** to
 * `POST /charts/:id/compute` — each item is a vinci `Query` (`@vinci/core`). The
 * fields below mirror the subset we translate to SQL: the dimension/measure shelves
 * (`rows`/`columns`/`values`), plus `sort`, `filter`, per-column `group`/`calculation`,
 * and `page`/`pageSize`. The integer enum tables are copied from `@vinci/core` (which
 * lives only in apps/web) — the same vendoring pattern `agents/viz-dsl-validate.ts`
 * uses. Keep in sync if the vendored vinci is upgraded; `test/chart-compute.test.ts`
 * guards the translation.
 */
import type { Dialect } from '../types';

export type { Dialect };

/** `@vinci/core` SUMMARY_TYPES — NONE marks a dimension (GROUP BY); the rest are aggregations. */
export const SUMMARY = {
  AGG: -1,
  NONE: 0,
  SUM: 1,
  AVERAGE: 2,
  MAX: 3,
  MIN: 4,
  MEDIAN: 5,
  DISTINCT: 6,
  COUNT: 7,
  STANDARD_DEVIATION: 8,
  VARIANCE: 9,
  FIRST: 10,
  LAST: 11,
} as const;

/** The summary types we translate to a SQL aggregate (others fall back to SUM + warn). */
export const SUPPORTED_SUMMARY = new Set<number>([
  SUMMARY.SUM,
  SUMMARY.AVERAGE,
  SUMMARY.MAX,
  SUMMARY.MIN,
  SUMMARY.DISTINCT,
  SUMMARY.COUNT,
]);

/** `@vinci/core` GROUP_TYPES — a dimension's time-bucket grain (NONE/SAME = group by the raw value). */
export const GROUP = {
  NONE: 0,
  SAME: 1,
  Y_M_D: 5,
  Y_M: 17,
  Y_W: 18,
  Y_Q: 16,
  Y_CYCLE: 23,
  Y: 6,
  Q: 7,
  M: 8,
  M_D: 22,
  W: 12,
  WD: 9,
  D: 10,
  H: 13,
  MIN: 14,
  S: 15,
  Y_M_D_H_MIN_S: 21,
} as const;

/** `@vinci/core` SORT_TYPES — NONE skips, CUSTOM orders by an explicit value sequence. */
export const SORT = { NONE: 0, ASC: 1, DESC: 2, CUSTOM: 3 } as const;

/** `@vinci/core` CALCULATION_TYPES — post-aggregation window calcs applied to a measure. */
export const CALC = {
  NONE: 0,
  PERCENT: 12,
  RANK_ASC: 1301,
  RANK_DESC: 1302,
  ACCUMULATE: 14,
} as const;

/** `@vinci/core` ValueChooseType on a Belong filter value — positive (IN) vs reverse (NOT IN). */
export const VALUE_CHOOSE = { MULTI: 1, ALL: 2, PARAMETER: 3 } as const;

/** `@vinci/core` FilterValueType — a fixed literal vs a runtime parameter (parameters are skipped). */
export const FILTER_VALUE_TYPE = { FIXED: 0, PARAMETER: 1 } as const;

/** `@vinci/core` DateFilterType on a date filter value item — only STATIC dates translate to SQL. */
export const DATE_FILTER_TYPE = { STATIC: 1, DYNAMIC: 2, PARAMETER: 4 } as const;

/**
 * The subset of `@vinci/core` FilterType we translate to SQL. Logical AND/OR combine a
 * node's leaves; the rest are leaf operators. Operators not listed here (compose-date,
 * system-json, permission, formula, error-value) are skipped with a warning.
 */
export const FILTER = {
  AND: 34,
  OR: 35,
  // string
  STR_BELONG: 1,
  STR_NOT_BELONG: 2,
  STR_CONTAIN: 3,
  STR_NOT_CONTAIN: 4,
  STR_BEGIN: 5,
  STR_NOT_BEGIN: 6,
  STR_END: 7,
  STR_NOT_END: 8,
  STR_NULL: 9,
  STR_NOT_NULL: 10,
  // number
  NUM_BETWEEN: 11,
  NUM_NOT_BETWEEN: 12,
  NUM_EQ: 13,
  NUM_NEQ: 14,
  NUM_LARGE: 15,
  NUM_SMALL: 16,
  NUM_LARGE_EQ: 17,
  NUM_SMALL_EQ: 18,
  NUM_TOP_N: 19,
  NUM_BOTTOM_N: 20,
  NUM_NULL: 21,
  NUM_NOT_NULL: 22,
  NUM_BELONG: 54,
  NUM_NOT_BELONG: 55,
  // date (static values only)
  DATE_BETWEEN: 23,
  DATE_NOT_BETWEEN: 24,
  DATE_LESS_THAN: 25,
  DATE_MORE_THAN: 26,
  DATE_EQ: 27,
  DATE_NEQ: 28,
  DATE_TOP_N: 29,
  DATE_BOTTOM_N: 30,
  DATE_NULL: 31,
  DATE_NOT_NULL: 32,
  DATE_BELONG: 52,
  DATE_NOT_BELONG: 53,
} as const;

/** A column on one of the query's shelves (rows/columns/values). */
export interface QueryColumn {
  /** 0 = a plain field we include; non-zero (formula/condition-format) is skipped. */
  columnType?: number;
  id: string;
  field?: string;
  name?: string;
  /** Fingerprint a `sort`/`filter` reference resolves against (preferred over id/field). */
  groupId?: string;
  summary?: { type: number };
  group?: { type: number };
  calculation?: { type: number };
}

/** One sort directive: order a dimension (`id`), optionally by a measure (`dependField`). */
export interface SortValue {
  id?: string;
  sortType: number;
  /** CUSTOM: the explicit value order. */
  values?: string[];
  /** Sort the dimension by this measure's aggregate (a measure groupId). */
  dependField?: string | null;
}

/** A leaf filter condition: an operator + value against a target field (`fieldId`). */
export interface FilterLeaf {
  id?: string;
  filterType: number;
  filterValue?: unknown;
  fieldId?: string | null;
  filterValueType?: number;
}

/** A filter group: a combinator (AND/OR) over its leaves. Groups are AND-ed together. */
export interface FilterNode {
  filterType: number;
  filterValue?: FilterLeaf[];
}

/** One vinci compute query (a `Query`/`LayerQuery`), the subset we read. */
export interface ComputeQuery {
  id: string;
  rows?: QueryColumn[];
  columns?: QueryColumn[];
  values?: QueryColumn[];
  sort?: SortValue[];
  filter?: FilterNode[];
  layerType?: 'agg' | 'afterAgg' | 'filter';
  page?: number;
  pageSize?: number;
}

/** vinci's columnar chart-data result (one per query). */
export interface ChartDataResult {
  fields: Array<{ id: string; name: string }>;
  cols: string[][];
  origins: string[][];
  rowSize: number;
  hasNext: boolean;
}

/**
 * A resolved query column: its kind, output alias, and the SQL pieces the translators
 * need — the quoted raw identifier (pre-aggregation WHERE / dimension grouping) and the
 * `groupExpr` (a dimension's grain expression, or a measure's SQL aggregate).
 */
export interface FieldRef {
  col: QueryColumn;
  kind: 'dim' | 'measure';
  /** Output alias `c0`, `c1`, … — what ORDER BY and the outer calc/top-N layers use. */
  alias: string;
  /** `"field"` — the raw base column, for pre-agg WHERE and dimension grouping. */
  quotedRaw: string;
  /** Dimension: grain(raw) or raw. Measure: the SQL aggregate (used in SELECT + HAVING). */
  groupExpr: string;
}
