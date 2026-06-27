import type {
	CalculationAlias,
	GroupAlias,
	SummaryAlias,
	TableFieldTypeAlias,
} from "../registry";
import type { CanonicalFieldConfigs } from "./fieldConfigs";
import type { CanonicalFieldGroupConfigs } from "./fieldGroupConfigs";
import type { CanonicalFilterItemType } from "./filter";
import type { CanonicalSortValue } from "./sort";

/**
 * Canonical：与 snapshot 1:1 同构，仅做命名与 enum 编码翻译。
 *
 * - 字段集合与 snapshot 完全对齐（含 mobx-keystone 的 $modelType / $modelId 元数据原样保留）
 * - 整数 enum（GroupTypes / SummaryTypes / CalculationTypes）翻译为字符串别名
 * - 已是字符串的 enum（CoordType / AxisPosition / AxisDisplayType / GeomTypes）不动
 * - 不做默认值折叠，不做语法糖
 *
 * 这是双向无损的可证明边界：snapshot ↔ Canonical 必须严格恒等。
 */

export interface CanonicalEncodingField {
	$modelType?: string;
	$modelId?: string;
	id: string;
	origin: { name: string; type: TableFieldTypeAlias };
	group: { type: GroupAlias; value?: unknown };
	summary: { type: SummaryAlias; value?: unknown };
	calculation: { type: CalculationAlias };
	total: { type: "sum" | "avg" | "formula"; value?: string };
	bucketId?: string;
}

export interface CanonicalGeomSeries {
	$modelType?: string;
	$modelId?: string;
	field: string;
	type: string;
	attributes: Record<string, unknown>;
}

export interface CanonicalBucket {
	id: string;
	type: "main" | "secondary";
	options?: Record<string, unknown>;
}

export interface CanonicalEncoding {
	$modelType?: string;
	$modelId?: string;
	cols: CanonicalEncodingField[];
	rows: CanonicalEncodingField[];
	values: CanonicalEncodingField[];
	totals: {
		col: {
			position: "none" | "left" | "right";
			grand: boolean;
			sub: boolean;
		};
		row: {
			position: "none" | "top" | "bottom";
			grand: boolean;
			sub: boolean;
		};
	};
	geoms: {
		series: CanonicalGeomSeries[];
		graphic: CanonicalGeomSeries;
	};
	buckets: CanonicalBucket[];
	config: {
		cols: { type: "parallel" | "aggregate" };
		rows: { type: "parallel" | "aggregate" };
	};
	forbiddenFields: string[];
}

/**
 * Canonical 根文档。
 *
 * MVP 范围：encoding 子树做完整结构化翻译；其余子树作为不透明 JSON
 * 原样保留（passthrough）。后续 Phase 逐步把 passthrough 替换为结构化形态。
 */
export interface CanonicalDoc {
	$modelType?: string;
	$modelId?: string;
	id: string;
	name: string;
	dataVersion: string;
	chartType: string;
	encoding: CanonicalEncoding;
	sort: CanonicalSortValue[];
	fieldGroupConfigs: CanonicalFieldGroupConfigs;
	/** filter：FilterType 等整数 enum 翻译为字符串别名（结构与 snapshot 同构）。 */
	filter: CanonicalFilterItemType[];
	/** fieldConfigs：条件格式 icon/text/dataBar 的 filter enum 翻译为别名。 */
	fieldConfigs: CanonicalFieldConfigs;
	/**
	 * table（数据源 schema）：snapshot↔canonical 层 1:1 passthrough，不翻译类型。
	 * 不落 surface（见 compact.ts）；surface→canonical 时由 `surf.table`（运行时注入）
	 * 或按 `fields` 声明合成，让 encoding 字段引用能在真实 VinciModel 里解析。
	 */
	table: unknown;
	metrics: unknown;
	tableFieldConfigs: unknown;
	settings: unknown;
	theme: unknown;
	// v1 严格要求 null（packageProxy / extension 不在 DSL v1 范围）
	packageProxy: null;
	extension: null;
}

/** 越出 v1 覆盖范围时抛出。 */
export class ScopeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScopeError";
	}
}
