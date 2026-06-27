import type {
	CanonicalDoc,
	CanonicalFieldConfig,
	CanonicalFieldConfigs,
} from "../canonical";
import { deepClone } from "../canonical/clone";
import { tableFieldTypeAliasMap } from "../registry";
import {
	buildAxesContextFromSurface,
	buildFieldsContextFromSurface,
} from "./context";
import { encodingFromSurface, geomsFromSurface } from "./encoding";
import { fieldConfigsFromSurface } from "./fieldConfigs";
import { fieldGroupConfigsFromSurface } from "./fieldGroupConfigs";
import { filterFromSurface } from "./filter";
import { createIdFactory } from "./idFactory";
import { MODEL_TYPES } from "./modelType";
import { settingsFromSurface } from "./settings";
import { sortFromSurface } from "./sort";
import type { SurfaceDoc, SurfaceFieldDef } from "./types";

/**
 * DSL 认可的「非图表」chartType：明细表 / 交叉表。其余（含图表 package 如 columnLine）
 * 一律降级为 "custom"，避免 onInit 创建图表 packageProxy 旁路 encoding。
 */
const TABLE_CHART_TYPES = new Set(["detail", "cross"]);

function resolveChartType(chartType: string | undefined): string {
	return chartType && TABLE_CHART_TYPES.has(chartType) ? chartType : "custom";
}

/**
 * passthrough 子树（table/theme）重建 mobx-keystone 的 `$modelType`（surface 已剥离）。
 * `$modelId` 不重建——fromSnapshot 时自动生成。空对象不加（保持缺省最简形态）。
 */
function retagModelType(value: unknown, modelType: string): unknown {
	if (value === undefined) return {};
	const out = deepClone(value);
	if (
		out !== null &&
		typeof out === "object" &&
		!Array.isArray(out) &&
		Object.keys(out).length > 0 &&
		!("$modelType" in (out as Record<string, unknown>))
	) {
		(out as Record<string, unknown>).$modelType = modelType;
	}
	return out;
}

/**
 * 解析 surface 的数据源 table（传递 table 信息到 snapshot）。
 *
 * table 不属于 LLM 编写的 DSL：运行时（agent）在 surfaceToSnapshot 前把当前
 * `model.table` 的 snapshot 写入 `surf.table`。这里优先透传它；surf.table 缺省时
 * 按 `fields` 声明合成一张最简表，让 encoding 字段引用能在真实 VinciModel 里解析
 * （否则 onInit 后 field.errorInfo 把字段判为「已删除」，model.error 误报「数据已丢失」）。
 */
function tableFromSurface(surf: SurfaceDoc): unknown {
	if (surf.table !== undefined) {
		return retagModelType(surf.table, MODEL_TYPES.table);
	}
	return synthTableFromFields(surf.fields);
}

/** 按 fields 声明合成 snapshot 形态的最简表（字段类型用 snapshot 整数，与 encoding origin 对齐）。 */
function synthTableFromFields(
	fields: Record<string, SurfaceFieldDef> | undefined,
): unknown {
	const seen = new Set<string>();
	const cols: Array<{ name: string; type: number }> = [];
	for (const def of Object.values(fields ?? {})) {
		if (seen.has(def.from)) continue;
		seen.add(def.from);
		cols.push({
			name: def.from,
			type: tableFieldTypeAliasMap.decode(def.type) as number,
		});
	}
	return {
		$modelType: MODEL_TYPES.table,
		fields: cols,
		params: [],
		missParams: [],
	};
}

function themeFromSurface(theme: unknown): unknown {
	return retagModelType(theme, MODEL_TYPES.theme);
}

/**
 * axes 条目上 co-located 的 `axis`（共享值轴外观）→ 按 bucketId keyed 的 fieldConfig。
 * 对齐 core：共享值轴从 `fieldConfigs[bucketId].valueAxisConfig` 读取（formatAxes.ts）。
 */
function axesAxisFieldConfigs(
	axes: SurfaceDoc["axes"],
): Record<string, CanonicalFieldConfig> {
	const out: Record<string, CanonicalFieldConfig> = {};
	for (const def of Object.values(axes ?? {})) {
		if (def.axis !== undefined) {
			out[def.id] = { valueAxisConfig: deepClone(def.axis) };
		}
	}
	return out;
}

/**
 * 合并多个 fieldConfig 来源（顶层 fieldConfig / 字段 co-located axis / axes co-located axis）。
 * 同一 key（fieldId 或 bucketId）按一级键浅合并即可——valueAxisConfig / categoryAxisConfig /
 * width / icon 等是互不重叠的一级键，不存在嵌套冲突。
 */
function mergeFieldConfigs(
	...sources: Array<Record<string, CanonicalFieldConfig>>
): CanonicalFieldConfigs {
	const out: CanonicalFieldConfigs = {};
	for (const src of sources) {
		for (const [key, cfg] of Object.entries(src)) {
			out[key] = { ...(out[key] ?? {}), ...cfg };
		}
	}
	return out;
}

/**
 * Surface → Canonical（expand）。
 *
 * - 从 fields/axes 表构建上下文
 * - encoding：紧凑字符串解析回 EncodingField，分配确定性 id
 * - geoms：按 alias 反查 EncodingField id
 * - 缺省子树补回默认值
 * - 结构化子树合成 $modelType（未携带 $modelId，由 mobx-keystone 在 fromSnapshot 时生成）
 */
export function surfaceToCanonical(surf: SurfaceDoc): CanonicalDoc {
	const fieldsCtx = buildFieldsContextFromSurface(surf.fields);
	const axesCtx = buildAxesContextFromSurface(surf.axes);
	const ids = createIdFactory();

	const encParts = encodingFromSurface(
		surf.encoding ?? {},
		{
			fields: fieldsCtx,
			axes: axesCtx,
		},
		ids,
	);

	// geoms 必须在 cols/rows/values 解析后再做，确保 alias→id 映射已就位。
	// 注意：geom 属性内的 fields[] 也会通过 idFactory.forAlias 分配新 id，
	// 与已分配的 ids 全局唯一（同 alias 自动追加 -2/-3 后缀）。
	// graphic geom（含 $metric）由 geoms.$graphic 项解析出来。
	const { series, graphic } = geomsFromSurface(
		surf.geoms,
		{ fields: fieldsCtx, axes: axesCtx },
		ids,
	);

	const chartType = resolveChartType(surf.chartType);
	// 明细表：所有展示列强制为「无聚合」明细字段（对齐 DetailPackage.convertToDetail），
	// 容错 LLM 在 values 里误写聚合（如 sales:sum）。cross 不归一化：维度/指标的区分
	// 本就由 surface ref 语法（:same / :sum）表达。
	if (chartType === "detail") {
		for (const f of encParts.values) {
			f.group = { type: "none" };
			f.summary = { type: "none" };
			f.calculation = { type: "none" };
		}
	}

	const canonical: CanonicalDoc = {
		$modelType: MODEL_TYPES.root,
		id: surf.id ?? "",
		name: surf.name ?? "",
		dataVersion: surf.dataVersion,
		// chartType 仅认可 detail（明细表）/ cross（交叉表）两个表格类型，其余一律
		// 降级为 "custom"（encoding 驱动渲染）。detail/cross 的 packageProxy 由 core 在
		// onInit 按 chartType 重建，且它们直接读 encoding.{values,cols,rows} 渲染，不会
		// 像图表 package 那样旁路 encoding，故安全。
		chartType,
		// 传递 table 信息：surf.table（运行时注入）优先，否则按 fields 合成校验表
		table: tableFromSurface(surf),
		encoding: {
			$modelType: MODEL_TYPES.encoding,
			cols: encParts.cols,
			rows: encParts.rows,
			values: encParts.values,
			totals: encParts.totals,
			geoms: {
				series,
				graphic,
			},
			buckets: encParts.buckets,
			config: encParts.config,
			forbiddenFields: encParts.forbiddenFields,
		},
		filter: surf.filter ? filterFromSurface(surf.filter, fieldsCtx) : [],
		sort: surf.sort ? sortFromSurface(surf.sort, fieldsCtx) : [],
		metrics: surf.metrics ? deepClone(surf.metrics) : [],
		// fieldConfigs 三源合并：顶层 fieldConfig（非轴：单元格/跳转/条件格式）+
		// x/y/values 字段 co-located 的 axis（按 fieldId）+ axes 条目 co-located 的 axis（按 bucketId）。
		fieldConfigs: mergeFieldConfigs(
			surf.fieldConfig ? fieldConfigsFromSurface(surf.fieldConfig, fieldsCtx) : {},
			encParts.axisFieldConfigs,
			axesAxisFieldConfigs(surf.axes),
		),
		fieldGroupConfigs: surf.fieldGroupConfigs
			? fieldGroupConfigsFromSurface(surf.fieldGroupConfigs, fieldsCtx)
			: {},
		tableFieldConfigs: surf.tableFieldConfig
			? deepClone(surf.tableFieldConfig)
			: {},
		settings:
			surf.settings !== undefined ? settingsFromSurface(surf.settings) : {},
		theme: themeFromSurface(surf.theme),
		packageProxy: null,
		extension: null,
	};

	return canonical;
}
