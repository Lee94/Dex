import type {
	CanonicalDoc,
	CanonicalFieldConfig,
	CanonicalFieldConfigs,
} from "../canonical";
import { deepClone } from "../canonical/clone";
import { foldableBucketIds, isContinuousField } from "./buckets";
import {
	buildAxesContextFromCanonical,
	buildFieldsContextFromCanonical,
} from "./context";
import {
	collectAllFields,
	encodingToSurface,
	geomsToSurface,
} from "./encoding";
import { fieldConfigsToSurface } from "./fieldConfigs";
import { fieldGroupConfigsToSurface } from "./fieldGroupConfigs";
import { filterToSurface } from "./filter";
import { stripModelIds } from "./modelType";
import { settingsToSurface } from "./settings";
import { sortToSurface } from "./sort";
import type { SurfaceAxisDef, SurfaceDoc, SurfaceFieldDef } from "./types";

const DSL_VERSION = "1";

interface AxisPlan {
	/** fieldId → 私有轴外观（落到 x/y/values 字段引用的 `axis`）。 */
	fieldAxis: Map<string, Record<string, unknown>>;
	/** bucketId → 共享值轴外观（落到 axes 条目的 `axis`）。 */
	bucketAxis: Map<string, Record<string, unknown>>;
	/** 抽走轴键后剩余的 fieldConfig（仍按 fieldId/bucketId keyed）。 */
	remainder: CanonicalFieldConfigs;
	/** 携带共享轴外观的 bucketId（这些桶禁止被 foldableBucketIds 折叠，否则配置无处安放）。 */
	bucketsWithAxis: Set<string>;
}

/**
 * 把 canonical fieldConfigs 里的「轴相关」键 co-locate 回 encoding：
 *
 * - 桶级 `valueAxisConfig`（key 是 bucketId）→ axes 条目 `axis`（共享值轴）。
 * - 度量私有轴 `valueAxisConfig`（key 是 fieldId、连续、无 bucketId、所在方向 parallel
 *   或 values 通道）→ 字段引用 `axis`。
 * - 维度 `categoryAxisConfig` + `sharedAxis`（key 是离散字段 id）→ 字段引用 `axis`（pos=sharedAxis）。
 * - 其余（非轴键、度量绑桶的 fieldId 级轴配置等）原样留在 `remainder`。
 *
 * 对齐 core `formatAxes.ts`：共享值轴按 `fieldConfigs[bucketId]` 读取，私有/parallel 与维度
 * 按 `fieldConfigs[fieldId]` 读取——因此抽取落点与运行时读取点一致，往返无损。
 */
function splitAxisConfigs(doc: CanonicalDoc): AxisPlan {
	const fieldAxis = new Map<string, Record<string, unknown>>();
	const bucketAxis = new Map<string, Record<string, unknown>>();
	const remainder: CanonicalFieldConfigs = {};
	const bucketsWithAxis = new Set<string>();

	const enc = doc.encoding;
	const bucketIds = new Set(enc.buckets.map((b) => b.id));
	const fieldById = new Map(collectAllFields(enc).map((f) => [f.id, f]));
	// 字段所在方向的 display；values 通道与 parallel 同为私有轴（不建共享桶）。
	const display = new Map<string, "parallel" | "aggregate" | "values">();
	for (const f of enc.cols) display.set(f.id, enc.config.cols.type);
	for (const f of enc.rows) display.set(f.id, enc.config.rows.type);
	for (const f of enc.values) display.set(f.id, "values");

	for (const [key, raw] of Object.entries(doc.fieldConfigs)) {
		const {
			valueAxisConfig,
			categoryAxisConfig,
			sharedAxis,
			...rest
		}: CanonicalFieldConfig = raw;
		const keepRest: CanonicalFieldConfig = { ...rest };

		// 桶级：共享值轴外观 → axes 条目
		if (bucketIds.has(key)) {
			if (valueAxisConfig !== undefined) {
				bucketAxis.set(key, deepClone(valueAxisConfig) as Record<string, unknown>);
				bucketsWithAxis.add(key);
			}
			// 桶上不该出现的轴键原样保留
			if (categoryAxisConfig !== undefined) keepRest.categoryAxisConfig = categoryAxisConfig;
			if (sharedAxis !== undefined) keepRest.sharedAxis = sharedAxis;
			if (Object.keys(keepRest).length > 0) remainder[key] = keepRest;
			continue;
		}

		const field = fieldById.get(key);
		const disp = display.get(key);
		const isPrivate = disp === "parallel" || disp === "values";

		// 度量私有轴：valueAxisConfig → 字段 axis
		if (field && !field.bucketId && isPrivate && isContinuousField(field)) {
			if (valueAxisConfig !== undefined) {
				fieldAxis.set(key, deepClone(valueAxisConfig) as Record<string, unknown>);
			}
			if (categoryAxisConfig !== undefined) keepRest.categoryAxisConfig = categoryAxisConfig;
			if (sharedAxis !== undefined) keepRest.sharedAxis = sharedAxis;
			if (Object.keys(keepRest).length > 0) remainder[key] = keepRest;
			continue;
		}

		// 维度：categoryAxisConfig + pos → 字段 axis
		if (field && !isContinuousField(field)) {
			const axisObj: Record<string, unknown> = {};
			if (categoryAxisConfig !== undefined) {
				Object.assign(axisObj, deepClone(categoryAxisConfig));
			}
			if (sharedAxis !== undefined) axisObj.pos = sharedAxis;
			if (Object.keys(axisObj).length > 0) fieldAxis.set(key, axisObj);
			if (valueAxisConfig !== undefined) keepRest.valueAxisConfig = valueAxisConfig;
			if (Object.keys(keepRest).length > 0) remainder[key] = keepRest;
			continue;
		}

		// 兜底：度量绑共享桶（轴配置在桶上而非字段上）/ 找不到字段 → 整条原样保留
		remainder[key] = deepClone(raw);
	}

	return { fieldAxis, bucketAxis, remainder, bucketsWithAxis };
}

/**
 * Canonical → Surface（compact）。
 *
 * - 收集 fields 表（去重 origin），分配可读 alias
 * - 收集 axes 表（buckets 分配 main/secondary 别名）
 * - encoding 重排：cols/rows/values → x/y/values，字段紧凑字符串
 * - geoms 重组：series → { [alias]: { type, ...attrs } }；graphic 压缩为 $metric
 * - 默认子树折叠：空数组、空对象、totals/config 等于默认值时省略
 * - 丢弃结构化子树上的 $modelType / $modelId
 */
export function canonicalToSurface(doc: CanonicalDoc): SurfaceDoc {
	const fieldsCtx = buildFieldsContextFromCanonical({
		allFields: collectAllFields(doc.encoding),
	});
	// 抽取轴配置：fieldConfigs 里的 valueAxisConfig/categoryAxisConfig/sharedAxis 回填到
	// x/y/values 字段引用（私有轴/维度）与 axes 条目（共享值轴）的 `axis`。
	const axisPlan = splitAxisConfigs(doc);
	// 折叠兜底桶：surfaceToSnapshot 物化出的「共享 main 值轴」桶（无 options、方向内唯一）
	// 不写回 axes 表，字段也省略 @alias，保持 surface 紧凑且往返稳定（fillFallbackBuckets 重建）。
	// 但携带共享轴外观（axis）的桶必须保留，否则其配置无处安放。
	const folded = foldableBucketIds(doc.encoding);
	for (const id of axisPlan.bucketsWithAxis) folded.delete(id);
	const axesCtx = buildAxesContextFromCanonical(
		doc.encoding.buckets.filter((b) => !folded.has(b.id)),
	);

	const fields: Record<string, SurfaceFieldDef> = {};
	for (const [alias, def] of fieldsCtx.aliasToDef) {
		fields[alias] = def;
	}
	// 不收 metric-name 这种内部字段进 fields 表（隐含在 $metric 糖衣里）
	for (const [alias, def] of Object.entries(fields)) {
		if (def.from === "__metric_name__") {
			delete fields[alias];
		}
	}

	const axes: Record<string, SurfaceAxisDef> = {};
	for (const [alias, bucket] of axesCtx.aliasToBucket) {
		const axisCfg = axisPlan.bucketAxis.get(bucket.id);
		axes[alias] = {
			id: bucket.id,
			pos: bucket.type,
			...(bucket.options ? { options: deepClone(bucket.options) } : {}),
			...(axisCfg ? { axis: axisCfg } : {}),
		};
	}

	const encoding = encodingToSurface(
		doc.encoding,
		{ fields: fieldsCtx, axes: axesCtx },
		axisPlan.fieldAxis,
	);

	const geoms = geomsToSurface(doc.encoding, {
		fields: fieldsCtx,
		axes: axesCtx,
	});

	const out: SurfaceDoc = {
		dslVersion: DSL_VERSION,
		dataVersion: doc.dataVersion,
	};
	if (doc.id) out.id = doc.id;
	if (doc.name) out.name = doc.name;
	// DSL v1 强制 chartType="custom"；compact 时省略默认值，让 surface 简洁。
	// 若 snapshot 携带非 custom 的 chartType（来自非 DSL 渠道），仍透传以便调试。
	if (doc.chartType && doc.chartType !== "custom") {
		out.chartType = doc.chartType;
	}

	if (Object.keys(fields).length > 0) out.fields = fields;
	if (Object.keys(axes).length > 0) out.axes = axes;

	// table（数据源 schema）不落 surface：它是确定性的上下文，由运行时注入
	// （agent 用当前 model.table，见 apps/agent-server）。surface 用 `fields` 表
	// 表达字段引用即可。snapshot/canonical 层仍 1:1 保留 table。

	if (Object.keys(encoding).length > 0) out.encoding = encoding;
	if (geoms) out.geoms = geoms;

	// 折叠默认空集合 / 空对象的 passthrough 子树
	if (Array.isArray(doc.filter) && doc.filter.length > 0)
		out.filter = filterToSurface(doc.filter, fieldsCtx);
	if (Array.isArray(doc.sort) && doc.sort.length > 0)
		out.sort = sortToSurface(doc.sort, fieldsCtx);
	if (Array.isArray(doc.metrics) && doc.metrics.length > 0)
		out.metrics = deepClone(doc.metrics) as unknown[];

	const nonEmptyObj = (v: unknown): v is Record<string, unknown> =>
		typeof v === "object" &&
		v !== null &&
		!Array.isArray(v) &&
		Object.keys(v).length > 0;

	// 抽走轴键后的残余 fieldConfig（非轴：单元格/跳转/条件格式等）才落 surface.fieldConfig。
	if (nonEmptyObj(axisPlan.remainder))
		out.fieldConfig = fieldConfigsToSurface(axisPlan.remainder, fieldsCtx);
	if (Object.keys(doc.fieldGroupConfigs).length > 0) {
		out.fieldGroupConfigs = fieldGroupConfigsToSurface(
			doc.fieldGroupConfigs,
			fieldsCtx,
		);
	}
	if (nonEmptyObj(doc.tableFieldConfigs))
		out.tableFieldConfig = deepClone(doc.tableFieldConfigs);

	if (doc.settings !== undefined && doc.settings !== null) {
		out.settings = settingsToSurface(doc.settings);
	}
	if (doc.theme !== undefined && doc.theme !== null) {
		const th = stripModelIds(doc.theme);
		if (th !== null && typeof th === "object" && !Array.isArray(th)) {
			delete (th as Record<string, unknown>).$modelType; // vinci/ThemeModel
		}
		out.theme = th;
	}

	return out;
}
