import { GeomAttributeKeysMap, type GeomTypes } from "@vinci/core";
import { deepClone } from "../canonical/clone";
import type {
	CanonicalEncoding,
	CanonicalEncodingField,
	CanonicalFieldConfig,
} from "../canonical";
import { isContinuousField } from "./buckets";
import type { AxesContext, FieldsContext } from "./context";
import { originKey } from "./context";
import {
	DEFAULT_CONFIG,
	DEFAULT_TOTALS,
	deepEqual,
	INTERNAL_GRAPHIC_GEOM_ID,
	isMetricColorAttr,
	makeEmptyGraphic,
	makeMetricColorFields,
} from "./defaults";
import { fieldToSurfaceRef, surfaceRefToField } from "./fieldRef";
import { compactOptions, expandOptions, validateSeriesGeom } from "./geomOptions";
import type { IdFactory } from "./idFactory";
import { MODEL_TYPES } from "./modelType";
import type {
	SurfaceEncoding,
	SurfaceFieldRef,
	SurfaceGeom,
} from "./types";
import { GRAPHIC_GEOM_SURFACE_KEY, SurfaceError } from "./types";

/**
 * 每个 attribute 的"占位默认值"——`{ fields: [] }`。
 *
 * snapshot 端的 GeomSeriesModel 期待按 geom type 把每个 mappable attribute key
 * 都挂上一个对象（哪怕只是空 fields）；运行时 `getAttributeOptions` / van-analysis
 * 会自动 merge 完整默认值（GEOM_ATTR_DEFAULTS + GEOM_ATTR_OVERRIDE_DEFAULTS），
 * 所以这里只补占位即可。
 */
function emptyAttrPlaceholder(): { fields: CanonicalEncodingField[] } {
	return { fields: [] };
}

function isEmptyAttrPlaceholder(v: unknown): boolean {
	if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
	const keys = Object.keys(v as object);
	if (keys.length !== 1 || keys[0] !== "fields") return false;
	const fields = (v as { fields?: unknown }).fields;
	return Array.isArray(fields) && fields.length === 0;
}

/**
 * 取 geom type 的所有 mappable attribute key（例如 interval =
 * ["options","color","size","label","tooltip","granularity"]）。未知 geom type
 * 时返回空数组，让上层用空属性集兜底（不抛错）。
 */
function mappableAttrKeysFor(type: string): string[] {
	const keys = (GeomAttributeKeysMap as Record<string, readonly string[]>)[type];
	return keys ? [...keys] : [];
}

function withFieldType(f: CanonicalEncodingField): CanonicalEncodingField {
	return f.$modelType ? f : { $modelType: MODEL_TYPES.encodingField, ...f };
}

/**
 * 注册一个由 geom 属性内 `fields[]` 展开而来的 EncodingField 到 FieldsContext：
 * - 把 id 反向映射到 alias（用于后续 compact）
 * - 把 id 追加进 alias 的 ids 列表（保证唯一性与可枚举性）
 */
function registerAttributeField(
	field: CanonicalEncodingField,
	ctx: { fields: FieldsContext },
): void {
	const alias = ctx.fields.originToAlias.get(
		originKey(field.origin.name, field.origin.type),
	);
	if (!alias) return;
	ctx.fields.idToAlias.set(field.id, alias);
	ctx.fields.aliasToIds.get(alias)?.push(field.id);
}

/**
 * 把 surface 端 geom 属性（color/text/tooltip/...）展开为 canonical 形态。
 *
 * 关键约束：
 * - 属性对象里的 `fields` 必须是完整 EncodingField 结构（而不是字符串别名），
 *   因为 mobx-keystone 在 fromSnapshot 时会创建 EncodingFieldModel 实例
 * - 每个展开出来的 EncodingField id 必须在整个 model 中唯一
 *   （idFactory.forAlias 内部按 alias 计数，多次调用同 alias 产出 -2/-3 后缀）
 */
function expandGeomAttribute(
	value: unknown,
	ctx: { fields: FieldsContext; axes: AxesContext },
	idFactory: IdFactory,
): unknown {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return deepClone(value);
	}
	const obj = value as Record<string, unknown>;
	if (!("fields" in obj)) {
		return deepClone(obj);
	}
	const rawFields = obj.fields;
	if (!Array.isArray(rawFields)) {
		throw new SurfaceError(
			`Geom attribute "fields" must be an array, got ${typeof rawFields}`,
		);
	}
	const expanded: CanonicalEncodingField[] = rawFields.map((ref) => {
		const f = withFieldType(
			surfaceRefToField(ref as SurfaceFieldRef, ctx, idFactory.forAlias),
		);
		registerAttributeField(f, ctx);
		return f;
	});
	const { fields: _drop, ...rest } = obj;
	return { fields: expanded, ...deepClone(rest) };
}

/**
 * borderColor 展开糖衣：把"边框线是一个颜色"统一展开为 `{ type:"custom", value }`。
 *
 * 两种 surface 写法都视为自定义边框色：
 * - 裸颜色字符串：`borderColor: "#7ED321"` → `{ type:"custom", value:"#7ED321" }`
 *   （若不处理，字符串会原样穿透成 canonical/snapshot 里的字符串，破坏 core 的
 *   `BorderColorAttribute = { type, value }` 契约——即"borderColor 直接变成字符串"）
 * - 对象但只给 `value` 未给 `type`：补 `type:"custom"`
 *
 * 原因：van-analysis 的 `formatAttrBorderColor` 只在 `type==="custom"` 时取 `value`
 * 作为边框色；`type` 缺省经 core 默认补成 `"auto"`（走自动派生分支），会忽略用户
 * 写的颜色。显式写了 `type`（含 `"auto"`）则尊重用户意图，不覆盖。
 */
function expandBorderColor(
	value: unknown,
	ctx: { fields: FieldsContext; axes: AxesContext },
	idFactory: IdFactory,
): unknown {
	// 裸颜色字符串糖衣
	if (typeof value === "string") {
		return { type: "custom", value };
	}
	const expanded = expandGeomAttribute(value, ctx, idFactory);
	if (expanded !== null && typeof expanded === "object" && !Array.isArray(expanded)) {
		const obj = expanded as Record<string, unknown>;
		if (typeof obj.value === "string" && obj.type === undefined) {
			obj.type = "custom";
		}
	}
	return expanded;
}

/**
 * 把 canonical 端 geom 属性压缩回 surface 形态：内部的 `fields[]` 由完整
 * EncodingField 压缩为 SurfaceFieldRef（紧凑字符串或对象）。
 */
function compactGeomAttribute(
	value: unknown,
	ctx: { fields: FieldsContext; axes: AxesContext },
): unknown {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return deepClone(value);
	}
	const obj = value as Record<string, unknown>;
	if (!("fields" in obj) || !Array.isArray(obj.fields)) {
		return deepClone(obj);
	}
	const canonFields = obj.fields as CanonicalEncodingField[];
	const compact = canonFields.map((f) => fieldToSurfaceRef(f, ctx));
	const { fields: _drop, ...rest } = obj;
	return { fields: compact, ...deepClone(rest) };
}

/**
 * 收集 canonical 里所有"出现过的字段"（含 geoms 内部 fields），
 * 用于构建 FieldsContext。
 */
export function collectAllFields(
	enc: CanonicalEncoding,
): CanonicalEncodingField[] {
	const result: CanonicalEncodingField[] = [];
	const seenIds = new Set<string>();
	const push = (f: CanonicalEncodingField | unknown) => {
		const ef = f as CanonicalEncodingField;
		if (!ef || typeof ef !== "object" || !ef.id) return;
		if (seenIds.has(ef.id)) return;
		seenIds.add(ef.id);
		result.push(ef);
	};
	for (const f of enc.cols) push(f);
	for (const f of enc.rows) push(f);
	for (const f of enc.values) push(f);
	for (const geom of [enc.geoms.graphic, ...enc.geoms.series]) {
		for (const attr of Object.values(geom.attributes)) {
			const a = attr as { fields?: unknown[] };
			if (Array.isArray(a?.fields)) {
				for (const f of a.fields) push(f);
			}
		}
	}
	return result;
}

/**
 * Canonical encoding → Surface encoding（不包含 geoms，geoms 单独处理）。
 *
 * - cols → x, rows → y, values → values（默认空数组折叠）
 * - buckets/config/totals/forbiddenFields 默认值折叠
 * - graphic geom 不再出现在 encoding 上；由 geomsToSurface 落到 geoms.$graphic
 */
export function encodingToSurface(
	enc: CanonicalEncoding,
	ctx: { fields: FieldsContext; axes: AxesContext },
	/** fieldId → 该字段私有轴的 co-located 配置（由 compact 层从 fieldConfigs 抽出）。 */
	fieldAxis?: ReadonlyMap<string, Record<string, unknown>>,
): SurfaceEncoding {
	const out: SurfaceEncoding = {};

	if (enc.cols.length > 0) {
		out.x = enc.cols.map((f) => fieldToSurfaceRef(f, ctx, fieldAxis?.get(f.id)));
	}
	if (enc.rows.length > 0) {
		out.y = enc.rows.map((f) => fieldToSurfaceRef(f, ctx, fieldAxis?.get(f.id)));
	}
	if (enc.values.length > 0) {
		out.values = enc.values.map((f) =>
			fieldToSurfaceRef(f, ctx, fieldAxis?.get(f.id)),
		);
	}

	// 非默认配置才落
	if (enc.config.cols.type !== DEFAULT_CONFIG.cols.type) {
		out.cols = { display: enc.config.cols.type };
	}
	if (enc.config.rows.type !== DEFAULT_CONFIG.rows.type) {
		out.rows = { display: enc.config.rows.type };
	}
	if (!deepEqual(enc.totals, DEFAULT_TOTALS)) {
		out.totals = deepClone(enc.totals);
	}
	// forbiddenFields（隐藏列，表格常用）：snapshot 是 EncodingField id，surface 用 alias
	// 表达（LLM 按列名隐藏）。映射不到 alias 的（孤立 id）原样保留。
	if (enc.forbiddenFields.length > 0) {
		out.forbiddenFields = enc.forbiddenFields.map(
			(id) => ctx.fields.idToAlias.get(id) ?? id,
		);
	}

	return out;
}

/**
 * 把一个字段引用上 co-located 的 `axis` 配置路由成 canonical fieldConfig（按 fieldId keyed）。
 *
 * - 度量（连续）→ `valueAxisConfig`；仅 private 轴（parallel 方向 / values 通道）合法，
 *   aggregate 共享值轴的配置须放 axes 条目上（否则 fillFallbackBuckets 后 core 按 bucketId
 *   读取，字段级配置会被忽略 → 静默失效，这里直接报错）。
 * - 维度（离散）→ `categoryAxisConfig`；`axis.pos` 单列为 `sharedAxis`。
 * - 与 `@alias`/`bucket` 互斥：绑定共享轴的字段不能再带 `axis`。
 */
function routeFieldAxis(
	ref: SurfaceFieldRef,
	field: CanonicalEncodingField,
	isPrivate: boolean,
	out: Record<string, CanonicalFieldConfig>,
): void {
	if (typeof ref === "string") return; // 紧凑串不承载 axis
	const axis = ref.axis;
	if (axis === undefined) return;
	if (ref.bucket !== undefined) {
		throw new SurfaceError(
			`字段 "${ref.field}" 绑定到共享轴 @${ref.bucket}，不能再带字段级 axis 外观。` +
				`整根轴配置请放 axes.${ref.bucket}.axis；只想该字段独立配置请改用 parallel（去掉 @${ref.bucket}）。`,
		);
	}
	if (isContinuousField(field)) {
		if (!isPrivate) {
			throw new SurfaceError(
				`字段 "${ref.field}" 处于 aggregate 共享值轴，不能带字段级 axis。` +
					`整根轴配置请在 axes 条目上写 axis 并用 @alias 绑定；` +
					`只想该字段走私有轴请把该方向设为 display:"parallel"。`,
			);
		}
		out[field.id] = { valueAxisConfig: deepClone(axis) };
		return;
	}
	// 维度：分类轴 + 可选 pos → sharedAxis
	const { pos, ...rest } = axis as { pos?: unknown; [k: string]: unknown };
	const cfg: CanonicalFieldConfig = {};
	if (Object.keys(rest).length > 0) cfg.categoryAxisConfig = deepClone(rest);
	if (pos !== undefined) cfg.sharedAxis = pos;
	if (Object.keys(cfg).length > 0) out[field.id] = cfg;
}

/**
 * Surface encoding → Canonical encoding（不含 geoms；geoms 由 geomsFromSurface 处理）。
 *
 * `axisFieldConfigs`：从 x/y/values 字段引用上 co-located 的 `axis` 抽出的 fieldConfig
 * （按 fieldId keyed），由 expand 合并进顶层 fieldConfigs。
 */
export function encodingFromSurface(
	surf: SurfaceEncoding,
	ctx: { fields: FieldsContext; axes: AxesContext },
	idFactory: IdFactory,
): {
	cols: CanonicalEncodingField[];
	rows: CanonicalEncodingField[];
	values: CanonicalEncodingField[];
	buckets: CanonicalEncoding["buckets"];
	totals: CanonicalEncoding["totals"];
	config: CanonicalEncoding["config"];
	forbiddenFields: string[];
	axisFieldConfigs: Record<string, CanonicalFieldConfig>;
} {
	const axisFieldConfigs: Record<string, CanonicalFieldConfig> = {};
	// private 轴 = parallel 方向，或 values 通道（values 不建共享桶，恒为私有轴）。
	const expand = (
		refs: SurfaceFieldRef[] | undefined,
		isPrivate: boolean,
	): CanonicalEncodingField[] =>
		(refs ?? []).map((r) => {
			const f = withFieldType(surfaceRefToField(r, ctx, idFactory.forAlias));
			routeFieldAxis(r, f, isPrivate, axisFieldConfigs);
			return f;
		});

	const cols = expand(surf.x, (surf.cols?.display ?? "aggregate") === "parallel");
	const rows = expand(surf.y, (surf.rows?.display ?? "aggregate") === "parallel");
	const values = expand(surf.values, true);

	// 记录所有出现过的 EncodingField id 到 alias 的反查（供 geoms 序列引用）
	for (const f of [...cols, ...rows, ...values]) {
		const a = ctx.fields.originToAlias.get(originKey(f.origin.name, f.origin.type));
		if (a) ctx.fields.aliasToIds.get(a)?.push(f.id);
	}

	const buckets = Array.from(ctx.axes.aliasToBucket.values());

	return {
		cols,
		rows,
		values,
		axisFieldConfigs,
		buckets,
		totals: surf.totals
			? {
					// 按 col/row 深合并：surface 可能只给出部分字段（如仅 position），
					// 缺省字段从 DEFAULT_TOTALS 补齐，避免浅合并丢掉 grand/sub。
					col: { ...DEFAULT_TOTALS.col, ...surf.totals.col },
					row: { ...DEFAULT_TOTALS.row, ...surf.totals.row },
				}
			: deepClone(DEFAULT_TOTALS),
		config: {
			cols: { type: surf.cols?.display ?? DEFAULT_CONFIG.cols.type },
			rows: { type: surf.rows?.display ?? DEFAULT_CONFIG.rows.type },
		},
		// forbiddenFields：surface 用 alias，映射回该 alias 的首个 EncodingField id
		// （表格每列仅出现一次，唯一）。已是 id 或未知引用则原样保留（向后兼容）。
		forbiddenFields: (surf.forbiddenFields ?? []).map(
			(ref) => ctx.fields.aliasToIds.get(ref)?.[0] ?? ref,
		),
	};
}

/**
 * 把一个 surface geom entry 展开为 canonical geom。
 *
 * graphic 与 series 本质同为 geom（运行时都是 GeomSeriesModel，仅 `field` 不同：
 * metric id vs `__graphic__`；删光指标时最后一个 series 直接降级为 graphic），故走
 * 同一套展开：per-geom 校验 → 按 type 补 `{ fields: [] }` 占位 → 覆盖显式属性
 * （options 按自身 type 嵌回 `{ [type]: {...} }`，其它属性走通用 fields 展开）。
 *
 * `color: "$metric"` 是「按指标名多系列上色」糖衣：展开成单个 metric-name 色字段。
 * 它属于各 series geom（逐图形重复上色），与 graphic 无关。
 */
function expandGeomEntry(
	alias: string,
	field: string,
	type: GeomTypes,
	rest: Record<string, unknown>,
	ctx: { fields: FieldsContext; axes: AxesContext },
	idFactory: IdFactory,
): CanonicalEncoding["geoms"]["graphic"] {
	validateSeriesGeom(alias, type, rest);
	const attributes: Record<string, unknown> = {};
	for (const k of mappableAttrKeysFor(type)) {
		attributes[k] = emptyAttrPlaceholder();
	}
	for (const [k, v] of Object.entries(rest)) {
		if (k === "color" && v === "$metric") {
			attributes.color = {
				fields: makeMetricColorFields(idFactory.forMetricName).map(withFieldType),
			};
			continue;
		}
		if (k === "options") {
			attributes[k] = expandOptions(v, type);
		} else if (k === "borderColor") {
			attributes[k] = expandBorderColor(v, ctx, idFactory);
		} else {
			attributes[k] = expandGeomAttribute(v, ctx, idFactory);
		}
	}
	return { $modelType: MODEL_TYPES.geomSeries, field, type, attributes };
}

/**
 * 把一个 canonical geom 压缩为 surface entry（series / graphic 共用）：折叠
 * `{ fields: [] }` 空占位，options 压平掉冗余 geom-type 嵌套，其它属性走通用 fields 压缩。
 *
 * `color = { fields: [metric-name] }`（多系列上色）压回 `color: "$metric"` 糖衣。
 * `emitType`：series 必带 type；graphic 仅在非默认 interval 时带（缺省即 interval）。
 */
function compactGeomEntry(
	geom: CanonicalEncoding["geoms"]["graphic"],
	ctx: { fields: FieldsContext; axes: AxesContext },
	emitType: boolean,
): SurfaceGeom {
	const entry: SurfaceGeom = {};
	if (emitType) entry.type = geom.type;
	for (const [k, v] of Object.entries(geom.attributes)) {
		if (isEmptyAttrPlaceholder(v)) continue;
		if (k === "color" && isMetricColorAttr(v)) {
			entry.color = "$metric";
			continue;
		}
		entry[k] =
			k === "options"
				? compactOptions(v, geom.type)
				: compactGeomAttribute(v, ctx);
	}
	return entry;
}

/**
 * Canonical geoms（series + graphic）→ Surface geoms。
 *
 * - 字段别名 keyed 的 entry：series 数组的逐项压缩
 *   - 多系列上色 `color = { fields:[metric-name] }` → `color: "$metric"` 糖衣
 * - 保留 key `$graphic`：仅在「无指标」（series 为空）时落 surface，表示被渲染的图形
 *   - 非默认 interval 才写 type，options 扁平化，空占位属性折叠
 *   - 空 interval graphic（全占位）→ 省略，不落 surface
 *   - 有指标时 graphic 休眠（renderedGeoms 取 series）→ 完全不出现
 */
export function geomsToSurface(
	enc: CanonicalEncoding,
	ctx: { fields: FieldsContext; axes: AxesContext },
): Record<string, SurfaceGeom> | undefined {
	const out: Record<string, SurfaceGeom> = {};

	for (const series of enc.geoms.series) {
		const alias = ctx.fields.idToAlias.get(series.field);
		if (!alias) {
			throw new SurfaceError(
				`Geom series field id "${series.field}" not found in fields context`,
			);
		}
		// series 必带 type
		out[alias] = compactGeomEntry(series, ctx, true);
	}

	// graphic 压缩——本质同为 geom，与 series 共用 compactGeomEntry。
	// graphic 仅在「无指标」（series 为空）时是被渲染的图形，才落 surface；
	// 有指标时 graphic 休眠（renderedGeoms 取 series），不出现在 surface。
	const graphic = enc.geoms.graphic;
	if (graphic.field !== INTERNAL_GRAPHIC_GEOM_ID) {
		throw new SurfaceError(`Unexpected graphic geom field: ${graphic.field}`);
	}
	if (enc.geoms.series.length === 0) {
		// 非默认 interval 才写 type；仅 interval + 全空占位（空 graphic）→ 省略不落 surface。
		const entry = compactGeomEntry(graphic, ctx, graphic.type !== "interval");
		if (Object.keys(entry).length > 0) {
			out[GRAPHIC_GEOM_SURFACE_KEY] = entry;
		}
	}

	if (Object.keys(out).length === 0) return undefined;
	return out;
}

/**
 * Surface geoms → Canonical geoms（series + graphic）。
 *
 * - 字段别名 keyed 的 entry → series 项
 *   - geom 顶层 field 通过 alias 查 cols/rows/values 解析后的 id（取第一个）
 *   - 每个属性内的 `fields[]` 展开为完整 EncodingField，分配全局唯一 id
 *   - `color: "$metric"` 展开为单个 metric-name 色字段（多系列上色，逐 series）
 * - 保留 key `$graphic` → canonical 的 graphic geom（仅无指标时被渲染的图形）
 *   - `{ type?, ... }` 按 series 同构展开（type 默认 interval，属性补占位）
 *   - 不接受 `color:"$metric"`（多系列上色属于 series）
 *   - 缺省 → 空 graphic
 */
export function geomsFromSurface(
	surfGeoms: Record<string, SurfaceGeom> | undefined,
	ctx: { fields: FieldsContext; axes: AxesContext },
	idFactory: IdFactory,
): {
	series: CanonicalEncoding["geoms"]["series"];
	graphic: CanonicalEncoding["geoms"]["graphic"];
} {
	const series: CanonicalEncoding["geoms"]["series"] = [];
	let graphicEntry: SurfaceGeom | undefined;

	if (surfGeoms) {
		for (const [alias, geom] of Object.entries(surfGeoms)) {
			if (alias === GRAPHIC_GEOM_SURFACE_KEY) {
				graphicEntry = geom;
				continue;
			}
			const ids = ctx.fields.aliasToIds.get(alias);
			if (!ids || ids.length === 0) {
				throw new SurfaceError(
					`Geom references alias "${alias}" but no EncodingField is bound to it`,
				);
			}
			const fieldId = ids[0];
			const { type, ...rest } = geom;
			if (type === undefined) {
				throw new SurfaceError(
					`Geom "${alias}" missing required field "type"`,
				);
			}
			// series 与 graphic 同为 geom，走同一套展开（校验 + 占位补齐 + 属性展开）。
			// 多系列上色 color:"$metric" 写在各 series 上，由 expandGeomEntry 展开。
			series.push(
				expandGeomEntry(
					alias,
					fieldId,
					type as GeomTypes,
					rest as Record<string, unknown>,
					ctx,
					idFactory,
				),
			);
		}
	}

	const graphic = buildGraphicFromSurface(graphicEntry, ctx, idFactory);
	return { series, graphic };
}

/**
 * 从 surface 的 $graphic 项构造 canonical graphic geom。
 *
 * `$graphic` 只表示「无指标」时被渲染的图形（`renderedGeoms` 在 series 为空时取
 * graphic，见 core `encoding.model.ts`），与 series 同为 geom：可带 `type` + 该 type
 * 的全部可映射属性（KPI=text、无指标 point/line 等都靠它表达）。
 *
 * 多系列上色（`color:"$metric"`）属于各 series geom（逐图形重复上色），**不写在
 * $graphic 上**——graphic 在有指标时根本不被渲染。
 *
 * 形态：
 * - 缺省 / 空对象 → makeEmptyGraphic（interval, attributes: {}）
 * - `{ type?, color?, size?, label?, text?, options?, ... }` → 无指标真实图形：
 *   type 省略默认 interval，属性按 series 同一套机器展开。
 */
function buildGraphicFromSurface(
	entry: SurfaceGeom | undefined,
	ctx: { fields: FieldsContext; axes: AxesContext },
	idFactory: IdFactory,
): CanonicalEncoding["geoms"]["graphic"] {
	if (!entry || Object.keys(entry).length === 0) {
		return { $modelType: MODEL_TYPES.geomSeries, ...makeEmptyGraphic() };
	}
	// $metric 是多系列上色糖衣，属于 series geom；graphic 是无指标图形，不能用它。
	if (entry.color === "$metric") {
		throw new SurfaceError(
			`geoms.${GRAPHIC_GEOM_SURFACE_KEY} 不能用 color:"$metric"。多系列上色属于各 series geom（写在 geoms.<alias>.color 上，逐图形重复）；$graphic 只表示无指标时被渲染的图形。`,
		);
	}
	// 无指标真实图形：与 series entry 同为 geom，走同一套展开。type 省略默认 interval。
	const { type: rawType, ...rest } = entry;
	const type = (rawType ?? "interval") as GeomTypes;
	return expandGeomEntry(
		GRAPHIC_GEOM_SURFACE_KEY,
		INTERNAL_GRAPHIC_GEOM_ID,
		type,
		rest as Record<string, unknown>,
		ctx,
		idFactory,
	);
}
