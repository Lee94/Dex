import type { VinciModel } from "@vinci/core";
import type { CanonicalFilterItemType } from "../canonical/filter";
import type { CanonicalSortValue } from "../canonical/sort";
import type {
	CalculationAlias,
	GroupAlias,
	SummaryAlias,
	TableFieldTypeAlias,
} from "../registry";
import type { SurfaceFieldConfigs } from "./fieldConfigs";
import type { SurfaceFieldGroupConfigs } from "./fieldGroupConfigs";

/**
 * Surface：用户/LLM 看到的紧凑形态。结构与 Canonical 显著不同，但通过
 * `canonicalToSurface` / `surfaceToCanonical` 严格可逆。
 *
 * 主要差异：
 * - 引入 `fields` 表（alias → origin），DSL 内部一律用 alias 引用字段
 * - 引入 `axes` 表（alias → bucket），rows/cols 用 `@axisAlias` 引用
 * - `encoding.cols/rows/values` 重命名为 `x/y/values` 并用紧凑字符串
 * - `geoms.series[]` 重组为 `geoms.{fieldAlias}`；多系列上色是各 series 的
 *   `color:"$metric"`，`geoms.$graphic` 仅表示无指标时被渲染的图形
 * - 默认子树折叠（filter/sort/metrics/values 空集合，totals/config 默认值等）
 * - 丢弃 mobx-keystone 的 $modelType / $modelId：结构化子树按位置重建；
 *   passthrough 子树（table/settings/theme）剥离后 expand 时按已知位置重建 $modelType
 *   （$modelId 不重建，fromSnapshot 自动生成）
 */

/**
 * geoms map 中代表 chart-wide graphic geom 的保留 key。
 * 与字段别名共用一个 map，但 LLM 一眼可辨（前缀 $ 与 $metric 风格一致）。
 */
export const GRAPHIC_GEOM_SURFACE_KEY = "$graphic";

/** 字段定义（fields 表项）。 */
export interface SurfaceFieldDef {
	from: string; // origin.name
	/**
	 * origin.type 别名：snapshot 里是 TABLE_FIELD_TYPES 整数（STRING=16/NUMBER=32/DATE=49 等），
	 * DSL 中表达为字符串别名（"string" / "number" / "decimal" / "date" / "datetime" / ...）。
	 */
	type: TableFieldTypeAlias;
}

/** 轴定义（axes 表项）。 */
export interface SurfaceAxisDef {
	id: string;
	pos: "main" | "secondary";
	options?: Record<string, unknown>;
	/**
	 * 共享值轴的外观配置（reverse / domain / label / title…），映射到
	 * `fieldConfigs[bucketId].valueAxisConfig`。绑定到本轴（`@alias`）的所有度量共享它。
	 *
	 * 与 `options`（几何形状特化，落 bucket.options）是两个不同落点，可并存。
	 */
	axis?: Record<string, unknown>;
}

/** 紧凑字段引用：字符串形态或对象形态。 */
export type SurfaceFieldRef = string | SurfaceFieldRefObject;

export interface SurfaceFieldRefObject {
	field: string; // alias
	summary?: SummaryAlias;
	group?: GroupAlias;
	calc?: CalculationAlias;
	bucket?: string; // axis alias
	total?: { type: "sum" | "avg" | "formula"; value?: string };
	/**
	 * 该字段**私有轴**的外观配置（co-located，避免散落到顶层 fieldConfig）。
	 *
	 * - 度量（连续）：内容是 valueAxisConfig（reverse / domain / label / title…），
	 *   映射到 `fieldConfigs[fieldId].valueAxisConfig`。**仅 parallel 模式合法**——
	 *   aggregate 共享值轴的配置须放在 axes 条目的 `axis` 上。
	 * - 维度（离散）：内容是 categoryAxisConfig（label / title…），可带 `pos`
	 *   （"main"|"secondary"）映射到 `fieldConfigs[fieldId].sharedAxis`。
	 *
	 * 与 `bucket`/`@alias`（绑定到哪根共享轴）互斥：绑定共享轴的字段不携带 `axis`，
	 * 配置应放在对应 axes 条目上。
	 */
	axis?: Record<string, unknown>;
}

/** graphic geom 的 color 属性形态：支持 "$metric" 糖衣或完整对象。 */
export type SurfaceColorRef =
	| "$metric"
	| { fields?: SurfaceFieldRef[]; [k: string]: unknown };

/**
 * geoms 表项：按字段别名 keyed，或保留 key `$graphic` 表示 chart-wide graphic geom。
 *
 * - 字段别名 keyed 的 entry：`{ type: GeomTypes, color?, size?, label?, tooltip?, ... }`
 * - `$graphic` entry 两种形态：
 *   - 多系列上色糖衣：`{ color: "$metric" }`（有指标时的休眠态，与 series 共存；
 *     interval-only sentinel，不能再带 type 或其它键）
 *   - 无指标真实图形：与 series entry 同构 `{ type?, color?, size?, label?, text?,
 *     options?, ... }`（type 省略默认 "interval"；KPI=text、无指标 point/line 等靠它表达）
 */
export interface SurfaceGeom {
	type?: string; // GeomTypes；$graphic 项可省（默认 "interval"）
	[attrName: string]: unknown; // color/size/label/options/...
}

export interface SurfaceEncoding {
	x?: SurfaceFieldRef[];
	y?: SurfaceFieldRef[];
	values?: SurfaceFieldRef[];
	cols?: { display: "parallel" | "aggregate" };
	rows?: { display: "parallel" | "aggregate" };
	totals?: {
		col?: {
			position?: "none" | "left" | "right";
			grand?: boolean;
			sub?: boolean;
		};
		row?: {
			position?: "none" | "top" | "bottom";
			grand?: boolean;
			sub?: boolean;
		};
	};
	forbiddenFields?: string[];
}

export interface SurfaceDoc {
	dslVersion: string;
	dataVersion: string;
	id?: string;
	name?: string;
	chartType?: string;

	fields?: Record<string, SurfaceFieldDef>;
	axes?: Record<string, SurfaceAxisDef>;

	/**
	 * 数据源 schema（确定性上下文）。**不由 compact 产出、不属于 LLM 生成/反编译的
	 * surface 表示**——字段引用走 `fields` 表即可。仅作为 expand/apply 的注入槽：
	 * 运行时（agent）在 surfaceToSnapshot 前写入当前 model.table 的 snapshot。
	 */
	table?: unknown;
	encoding?: SurfaceEncoding;
	geoms?: Record<string, SurfaceGeom>;

	/** 排序项（与 canonical 结构等价，sortType 用字符串别名）。 */
	sort?: CanonicalSortValue[];

	/**
	 * 数据筛选。结构与 snapshot 同构，但 FilterType 等整数 enum 已翻译为
	 * 字符串别名（如 `num_gte`）。fieldId 仍是 snapshot 的 groupId 指纹。
	 */
	filter?: CanonicalFilterItemType[];
	// passthrough（MVP）；折叠为缺省时省略
	metrics?: unknown[];
	/**
	 * 单字段配置。条件格式 icon/text/dataBar 用 surface 形态（when 表达式），
	 * 其余字段透传。
	 */
	fieldConfig?: SurfaceFieldConfigs;
	/**
	 * 字段组配置（按 origin 维度共享）。key 优先使用紧凑形态（"sales:sum" 等），
	 * 当 fields 表无匹配 alias 时退化为 canonical 形态（"销售额$$same$$none$$none"）。
	 * textIcon 条件格式用 surface 形态。
	 */
	fieldGroupConfigs?: SurfaceFieldGroupConfigs;
	tableFieldConfig?: Record<string, unknown>;
	settings?: unknown;
	theme?: unknown;
}

/** Surface 转换出错（违反 surface 约定，如别名冲突）。 */
export class SurfaceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SurfaceError";
	}
}

export type Snapshot = (typeof VinciModel)["prototype"]["snapshot"];
