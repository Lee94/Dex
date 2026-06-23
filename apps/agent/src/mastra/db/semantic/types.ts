/**
 * The CubeJS-style semantic model (v0.4).
 *
 * A typed, hand-authored model of cubes (each mapping to a table), carrying
 * measures (aggregations), dimensions (attributes), joins (relationships), and
 * named/endorsed metrics built on top. The agent issues a *semantic query*
 * (measures + dimensions + a time grain + filters) and the compiler emits
 * correct, read-only SQL — so answers use governed, consistent definitions
 * instead of re-derived ad-hoc SQL.
 *
 * Authoring convention: every cube's source is aliased AS its `name`, so a
 * measure/dimension/join `sql` references columns as `<cubeName>.<column>`
 * (e.g. `order_items.quantity * order_items.unit_price`). This keeps the model
 * explicit and the compiler simple.
 */

export type MeasureType = 'count' | 'sum' | 'avg' | 'count_distinct' | 'min' | 'max' | 'ratio';
export type DimensionType = 'categorical' | 'temporal' | 'numeric';
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type Relationship = 'many_to_one' | 'one_to_many' | 'one_to_one';
export type Format = 'number' | 'integer' | 'currency' | 'percent';

export interface Measure {
  name: string;
  title?: string;
  description?: string;
  type: MeasureType;
  /** Expression over the cube's columns. Optional for `count` (→ COUNT(*)).
   *  For `ratio`, this is a *complete* aggregate expression used verbatim. */
  sql?: string;
  /** Extra cubes this measure's SQL references and therefore must be joined. */
  requires?: string[];
  format?: Format;
  endorsed?: boolean;
}

export interface Dimension {
  name: string;
  title?: string;
  description?: string;
  type: DimensionType;
  /** Expression over the cube's columns, e.g. `products.category`. */
  sql: string;
}

export interface Join {
  /** Target cube name. */
  to: string;
  relationship: Relationship;
  /** ON condition, e.g. `order_items.order_id = orders.id`. */
  sql: string;
}

export interface Cube {
  name: string;
  title?: string;
  description?: string;
  /** Base table name (or subquery); aliased AS `name` in the FROM clause. */
  sql: string;
  endorsed?: boolean;
  measures: Measure[];
  dimensions: Dimension[];
  joins?: Join[];
}

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'contains';

export interface SemanticFilter {
  /** `cube.dimension`. */
  member: string;
  operator: FilterOperator;
  values: (string | number)[];
}

/** A canonical, reusable definition — the unit a user/agent actually asks for. */
export interface NamedMetric {
  name: string;
  title?: string;
  description?: string;
  /** `cube.measure` this metric is built on. */
  measure: string;
  /** Baked-in filters (e.g. status = 'completed'). */
  filters?: SemanticFilter[];
  endorsed?: boolean;
}

export interface SemanticModel {
  cubes: Cube[];
  metrics: NamedMetric[];
}

export interface OrderBy {
  /** A measure/metric alias or a dimension alias from the query. */
  member: string;
  direction: 'asc' | 'desc';
}

export interface SemanticQuery {
  /** `cube.measure` refs or named-metric names. */
  measures: string[];
  /** `cube.dimension` refs. */
  dimensions?: string[];
  timeDimension?: { dimension: string; granularity: Granularity };
  filters?: SemanticFilter[];
  order?: OrderBy[];
  limit?: number;
}

export interface CompileResult {
  /** The generated read-only SQL. */
  sql: string;
  /** True only if every measure/metric used is endorsed. */
  endorsed: boolean;
  /** Output column aliases for the selected measures. */
  measures: string[];
  /** Output column aliases for the selected dimensions. */
  dimensions: string[];
  /** Cubes touched (FROM + JOINs). */
  cubes: string[];
}
