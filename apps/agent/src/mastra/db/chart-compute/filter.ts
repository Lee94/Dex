/**
 * Translate a vinci `Query.filter` (`FilterNode[]`) into SQL predicates.
 *
 * The model is two levels: the top-level groups are AND-ed; within a group the leaves
 * are combined by the group's `filterType` (AND/OR). Each leaf targets a field by
 * `fieldId` (a groupId) — if that field is a **dimension** the predicate is pre-aggregation
 * (`WHERE`), if a **measure** it's post-aggregation (`HAVING`, over the same SQL aggregate
 * shown in the SELECT). Top-N/Bottom-N operators aren't predicates — they become an
 * ORDER BY + LIMIT directive the orchestrator applies after aggregation.
 *
 * Only fixed literals and the common string/number/(static-)date operators translate;
 * the long tail (parameters, dynamic/compose dates, system-json, permission, formula)
 * is skipped with a warning, per the "translate what we can, warn on the rest" contract.
 */
import {
  DATE_FILTER_TYPE,
  FILTER,
  FILTER_VALUE_TYPE,
  VALUE_CHOOSE,
  type FieldRef,
  type FilterLeaf,
  type FilterNode,
} from './types';
import { likeLit, numLit, strLit } from './sql';

export interface TopNDirective {
  /** The SQL expression to order by (a measure aggregate or a dimension column). */
  expr: string;
  dir: 'ASC' | 'DESC';
  n: number;
}

export interface CompiledFilter {
  where: string[];
  having: string[];
  topN: TopNDirective[];
  warnings: string[];
}

type Resolve = (key: string | null | undefined) => FieldRef | undefined;

/** A single leaf's translation: a predicate (routed to WHERE/HAVING) or a Top-N cut. */
type LeafResult =
  | { kind: 'where' | 'having'; sql: string }
  | { kind: 'topN'; directive: TopNDirective }
  | null;

export function compileFilter(nodes: FilterNode[], resolve: Resolve): CompiledFilter {
  const where: string[] = [];
  const having: string[] = [];
  const topN: TopNDirective[] = [];
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);

  for (const node of nodes ?? []) {
    const combinator = node.filterType === FILTER.OR ? 'OR' : 'AND';
    const leaves = Array.isArray(node.filterValue) ? node.filterValue : [];
    const whereParts: string[] = [];
    const havingParts: string[] = [];
    for (const leaf of leaves) {
      const r = compileLeaf(leaf, resolve, warn);
      if (!r) continue;
      if (r.kind === 'topN') topN.push(r.directive);
      else if (r.kind === 'where') whereParts.push(r.sql);
      else havingParts.push(r.sql);
    }
    // OR can't span the pre/post-aggregation boundary in one SQL clause — if a group
    // mixes dimension and measure leaves under OR, the cross-boundary OR is lost.
    if (combinator === 'OR' && whereParts.length > 0 && havingParts.length > 0) {
      warn(
        'an OR filter mixing a dimension and a measure is approximated as AND across WHERE/HAVING',
      );
    }
    if (whereParts.length) where.push(joinGroup(whereParts, combinator));
    if (havingParts.length) having.push(joinGroup(havingParts, combinator));
  }

  return { where, having, topN, warnings };
}

/** Join a group's same-bucket leaves with its combinator, parenthesizing when needed. */
function joinGroup(parts: string[], combinator: 'AND' | 'OR'): string {
  if (parts.length === 1) return parts[0];
  return `(${parts.join(` ${combinator} `)})`;
}

function compileLeaf(leaf: FilterLeaf, resolve: Resolve, warn: (m: string) => void): LeafResult {
  const op = leaf.filterType;
  const ref = resolve(leaf.fieldId);
  if (!ref) {
    warn(`filter on an unknown field (fieldId ${String(leaf.fieldId)}) was skipped`);
    return null;
  }
  // A parameter-valued filter has no literal to embed — skip it.
  if (leaf.filterValueType === FILTER_VALUE_TYPE.PARAMETER) {
    warn('a parameter-valued filter was skipped');
    return null;
  }

  // WHERE targets the raw column (pre-aggregation); HAVING targets the SQL aggregate.
  const isMeasure = ref.kind === 'measure';
  const target = isMeasure ? ref.groupExpr : ref.quotedRaw;
  const kind = isMeasure ? 'having' : 'where';
  const pred = (sql: string): LeafResult => ({ kind, sql });
  const v = leaf.filterValue;

  switch (op) {
    // ---- null / not-null (string + number + date share the same SQL) ----
    case FILTER.STR_NULL:
    case FILTER.NUM_NULL:
    case FILTER.DATE_NULL:
      return pred(`${target} IS NULL`);
    case FILTER.STR_NOT_NULL:
    case FILTER.NUM_NOT_NULL:
    case FILTER.DATE_NOT_NULL:
      return pred(`${target} IS NOT NULL`);

    // ---- string ----
    case FILTER.STR_BELONG:
      return belong(target, v, false, strLit, warn, pred);
    case FILTER.STR_NOT_BELONG:
      return belong(target, v, true, strLit, warn, pred);
    case FILTER.STR_CONTAIN:
      return like(target, v, 'contain', false, warn, pred);
    case FILTER.STR_NOT_CONTAIN:
      return like(target, v, 'contain', true, warn, pred);
    case FILTER.STR_BEGIN:
      return like(target, v, 'begin', false, warn, pred);
    case FILTER.STR_NOT_BEGIN:
      return like(target, v, 'begin', true, warn, pred);
    case FILTER.STR_END:
      return like(target, v, 'end', false, warn, pred);
    case FILTER.STR_NOT_END:
      return like(target, v, 'end', true, warn, pred);

    // ---- number compare ----
    case FILTER.NUM_EQ:
      return numCompare(target, v, '=', warn, pred);
    case FILTER.NUM_NEQ:
      return numCompare(target, v, '<>', warn, pred);
    case FILTER.NUM_LARGE:
      return numCompare(target, v, '>', warn, pred);
    case FILTER.NUM_SMALL:
      return numCompare(target, v, '<', warn, pred);
    case FILTER.NUM_LARGE_EQ:
      return numCompare(target, v, '>=', warn, pred);
    case FILTER.NUM_SMALL_EQ:
      return numCompare(target, v, '<=', warn, pred);
    case FILTER.NUM_BETWEEN:
      return numBetween(target, v, false, warn, pred);
    case FILTER.NUM_NOT_BETWEEN:
      return numBetween(target, v, true, warn, pred);
    case FILTER.NUM_BELONG:
      return belong(target, v, false, (x) => numLit(x) ?? strLit(x), warn, pred);
    case FILTER.NUM_NOT_BELONG:
      return belong(target, v, true, (x) => numLit(x) ?? strLit(x), warn, pred);

    // ---- top / bottom N (number + date) → an ORDER BY + LIMIT directive ----
    // Ordered by the output alias (the post-aggregation value), valid in every layer.
    case FILTER.NUM_TOP_N:
    case FILTER.DATE_TOP_N:
      return topN(ref.alias, v, 'DESC', warn);
    case FILTER.NUM_BOTTOM_N:
    case FILTER.DATE_BOTTOM_N:
      return topN(ref.alias, v, 'ASC', warn);

    // ---- date (static values only) ----
    case FILTER.DATE_EQ:
      return dateCompare(target, v, '=', warn, pred);
    case FILTER.DATE_NEQ:
      return dateCompare(target, v, '<>', warn, pred);
    case FILTER.DATE_LESS_THAN:
      return dateCompare(target, v, '<=', warn, pred);
    case FILTER.DATE_MORE_THAN:
      return dateCompare(target, v, '>=', warn, pred);
    case FILTER.DATE_BETWEEN:
      return dateBetween(target, v, false, warn, pred);
    case FILTER.DATE_NOT_BETWEEN:
      return dateBetween(target, v, true, warn, pred);
    case FILTER.DATE_BELONG:
      return belong(target, v, false, strLit, warn, pred);
    case FILTER.DATE_NOT_BELONG:
      return belong(target, v, true, strLit, warn, pred);

    default:
      warn(`unsupported filter operator (${op}) was skipped`);
      return null;
  }
}

/**
 * A scalar filter value as a string: a bare string/number, or the primitive `.value`
 * of a `{ value }` wrapper (vinci sends some operands wrapped). Empty otherwise — callers
 * treat `''` as "no value" and skip with a warning rather than building a degenerate
 * predicate (e.g. `LIKE '%%'` would match every row).
 */
function scalar(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const inner = (v as Record<string, unknown>).value;
    return inner == null || typeof inner === 'object' ? '' : String(inner);
  }
  return String(v);
}

/**
 * A contains/begins/ends LIKE (or its negation). An empty value is skipped with a warning
 * — `LIKE '%%'` / `LIKE '%'` would match every row and `NOT LIKE '%'` none, silently.
 */
function like(
  target: string,
  v: unknown,
  mode: 'contain' | 'begin' | 'end',
  negate: boolean,
  warn: (m: string) => void,
  pred: (sql: string) => LeafResult,
): LeafResult {
  const sv = scalar(v);
  if (!sv) {
    warn(`a string "${mode}" filter had no value and was skipped`);
    return null;
  }
  return pred(`${target} ${negate ? 'NOT LIKE' : 'LIKE'} ${likeLit(sv, mode)}`);
}

/** Extract a Belong value's chosen literals + whether it's a reverse (NOT IN) selection. */
function belongValues(v: unknown): { values: string[]; reverse: boolean } | null {
  if (Array.isArray(v)) return { values: v.map(String), reverse: false };
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.value)) {
      // VALUE_CHOOSE.ALL means "all values EXCEPT these" — a reverse selection → NOT IN.
      return { values: o.value.map(String), reverse: o.type === VALUE_CHOOSE.ALL };
    }
  }
  return null;
}

function belong(
  target: string,
  v: unknown,
  negate: boolean,
  lit: (x: string) => string,
  warn: (m: string) => void,
  pred: (sql: string) => LeafResult,
): LeafResult {
  const got = belongValues(v);
  if (!got || got.values.length === 0) {
    warn('a "belong" filter had no values and was skipped');
    return null;
  }
  const list = got.values.map(lit).join(', ');
  // A reverse selection (ValueChooseType.ALL) inverts the operator.
  const not = negate !== got.reverse;
  return pred(`${target} ${not ? 'NOT IN' : 'IN'} (${list})`);
}

function numCompare(
  target: string,
  v: unknown,
  sqlOp: string,
  warn: (m: string) => void,
  pred: (sql: string) => LeafResult,
): LeafResult {
  const n = numLit(scalar(v));
  if (n == null) {
    warn(`a numeric filter (${sqlOp}) had a non-numeric value and was skipped`);
    return null;
  }
  return pred(`${target} ${sqlOp} ${n}`);
}

function numBetween(
  target: string,
  v: unknown,
  negate: boolean,
  warn: (m: string) => void,
  pred: (sql: string) => LeafResult,
): LeafResult {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const min = numLit(o.min);
  const max = numLit(o.max);
  if (min == null || max == null) {
    warn('a numeric "between" filter was missing min/max and was skipped');
    return null;
  }
  // `closeMin`/`closeMax` default to inclusive (true) when absent.
  const lo = o.closeMin === false ? '>' : '>=';
  const hi = o.closeMax === false ? '<' : '<=';
  const inRange = `(${target} ${lo} ${min} AND ${target} ${hi} ${max})`;
  return pred(negate ? `NOT ${inRange}` : inRange);
}

function topN(
  target: string,
  v: unknown,
  dir: 'ASC' | 'DESC',
  warn: (m: string) => void,
): LeafResult {
  // vinci sends the N either as a bare number/string or wrapped as `{ value: N }`.
  const n = numLit(scalar(v));
  if (n == null || Number(n) <= 0) {
    warn('a Top-N/Bottom-N filter had no positive N and was skipped');
    return null;
  }
  return { kind: 'topN', directive: { expr: target, dir, n: Math.floor(Number(n)) } };
}

/** Build a `YYYY-MM-DD` literal from a static date value item, or null if not static. */
function staticDate(item: unknown): string | null {
  if (typeof item === 'string') return item.trim() ? strLit(item.trim()) : null;
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  if (o.type != null && o.type !== DATE_FILTER_TYPE.STATIC) return null; // dynamic/parameter
  const val = (o.value && typeof o.value === 'object' ? o.value : o) as Record<string, unknown>;
  const y = val.year;
  if (y == null) return null;
  const pad = (n: unknown, d = 1) => String(Number(n ?? d)).padStart(2, '0');
  return strLit(`${y}-${pad(val.month)}-${pad(val.day)}`);
}

function dateCompare(
  target: string,
  v: unknown,
  sqlOp: string,
  warn: (m: string) => void,
  pred: (sql: string) => LeafResult,
): LeafResult {
  const d = staticDate(v);
  if (d == null) {
    warn(`a date filter (${sqlOp}) used a dynamic/parameter value and was skipped`);
    return null;
  }
  return pred(`${target} ${sqlOp} ${d}`);
}

function dateBetween(
  target: string,
  v: unknown,
  negate: boolean,
  warn: (m: string) => void,
  pred: (sql: string) => LeafResult,
): LeafResult {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const start = staticDate(o.start);
  const end = staticDate(o.end);
  if (start == null || end == null) {
    warn('a date "between" filter used dynamic/parameter bounds and was skipped');
    return null;
  }
  const inRange = `(${target} >= ${start} AND ${target} <= ${end})`;
  return pred(negate ? `NOT ${inRange}` : inRange);
}
