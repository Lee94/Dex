import type {
	DateFilterType,
	DatePositionType,
	FilterItemType,
	FilterItemValue,
	FilterType,
	FilterValueType,
	TableFieldTypes,
	ValueChooseType,
} from "@vinci/core";
import {
	type DateFilterTypeAlias,
	dateFilterTypeAliasMap,
	type DatePositionTypeAlias,
	datePositionTypeAliasMap,
	type FilterTypeAlias,
	filterTypeAliasMap,
	type FilterValueTypeAlias,
	filterValueTypeAliasMap,
	type TableFieldTypeAlias,
	tableFieldTypeAliasMap,
	type ValueChooseTypeAlias,
	valueChooseTypeAliasMap,
} from "../registry";
import { deepClone } from "./clone";
import { groupIdFromCanonical, groupIdToCanonical } from "./groupId";

/**
 * Canonical filter：与 snapshot `VinciModel.filter`（`FilterItemType[]`）1:1 同构，
 * 仅把整数 enum 翻译为字符串别名。这是 DSL 的头号"硬骨头"（37+ 种 FilterType
 * 递归判别联合），见 DESIGN.md §8。
 *
 * 翻译覆盖的 enum：
 * - FilterType（操作符判别标签）—— FilterItemType / FilterItemValue 上的 `filterType`
 * - FilterValueType（固定值/参数）—— `filterValueType` 以及 NumberBetween 的 maxType/minType
 * - ValueChooseType（正选/反选/参数）—— Belong 值的 `type`
 * - DateFilterType（静态/动态/参数）—— 日期值项的 `type`
 * - DatePositionType（当前/期初/期末）—— 日期值的 `value.position`
 * - TableFieldTypes —— 参数/复合日期值里的 `dateType`
 *
 * 关键设计：编/解码用同一套**按结构分派**的逻辑（见 translateFilterValue），
 * 只是把 enum codec 从 encode 换成 decode。结构判别只看键名与值的形态
 * （数组/对象/字符串），与值是整数还是别名无关，因此 `to ∘ from = id`、
 * `from ∘ to = id` 由构造保证。
 */

export interface CanonicalFilterItemValue {
	id?: string;
	filterType: FilterTypeAlias;
	/** 结构化翻译后的 FilterValue（enum 已变别名）；形态见 translateFilterValue。 */
	filterValue?: unknown;
	fieldId?: string | null;
	filterValueType?: FilterValueTypeAlias;
	[k: string]: unknown;
}

export interface CanonicalFilterItemType {
	filterType: FilterTypeAlias;
	filterValue: CanonicalFilterItemValue[];
	[k: string]: unknown;
}

/**
 * enum codec：to（snapshot→canonical）用各表的 encode，from 用 decode。
 * 形参全部声明为 unknown，因为同一份结构遍历逻辑要同时吃整数与别名两种输入。
 */
interface EnumCodec {
	filterType(v: unknown): unknown;
	filterValueType(v: unknown): unknown;
	valueChooseType(v: unknown): unknown;
	dateFilterType(v: unknown): unknown;
	datePosition(v: unknown): unknown;
	tableFieldType(v: unknown): unknown;
	/** fieldId 是 groupId 引用（源字段+分组+汇总+计算的整数/别名指纹）。 */
	groupId(v: string): string;
}

const TO_CANONICAL: EnumCodec = {
	filterType: (v) => filterTypeAliasMap.encode(v as FilterType),
	filterValueType: (v) => filterValueTypeAliasMap.encode(v as FilterValueType),
	valueChooseType: (v) => valueChooseTypeAliasMap.encode(v as ValueChooseType),
	dateFilterType: (v) => dateFilterTypeAliasMap.encode(v as DateFilterType),
	datePosition: (v) => datePositionTypeAliasMap.encode(v as DatePositionType),
	tableFieldType: (v) => tableFieldTypeAliasMap.encode(v as TableFieldTypes),
	groupId: groupIdToCanonical,
};

const FROM_CANONICAL: EnumCodec = {
	filterType: (v) => filterTypeAliasMap.decode(v as FilterTypeAlias),
	filterValueType: (v) =>
		filterValueTypeAliasMap.decode(v as FilterValueTypeAlias),
	valueChooseType: (v) =>
		valueChooseTypeAliasMap.decode(v as ValueChooseTypeAlias),
	dateFilterType: (v) => dateFilterTypeAliasMap.decode(v as DateFilterTypeAlias),
	datePosition: (v) =>
		datePositionTypeAliasMap.decode(v as DatePositionTypeAlias),
	tableFieldType: (v) => tableFieldTypeAliasMap.decode(v as TableFieldTypeAlias),
	groupId: groupIdFromCanonical,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 翻译一个"带 type 的叶子值"：可能是
 * - BelongFilterValue        `{ type: ValueChooseType, value: string[], assist? }`
 * - BelongParameterFilterValue `{ type: ValueChooseType.PARAMETER, parameterId, dateType }`
 * - DateFilterValueItem      `{ type: DateFilterType, value: { ...日期, position? } }`
 * - DateParameterFilterValueItem `{ type: DateFilterType.PARAMETER, value: string }`
 * - ComposeDate(Parameter)FilterValueItem `{ type, value?, dateType }`
 *
 * 判别（与整数/别名无关，只看结构）：
 * - 含 value 数组 / parameterId / assist → Belong 家族 → `type` 是 ValueChooseType
 * - 否则 → 日期值项 → `type` 是 DateFilterType；含 dateType 则同时翻译；
 *   value 为对象时翻译其中的 position。
 */
function translateTypeBearing(
	obj: Record<string, unknown>,
	codec: EnumCodec,
): Record<string, unknown> {
	const out = deepClone(obj);
	if (!("type" in obj)) return out;

	const isBelong =
		Array.isArray(obj.value) || "parameterId" in obj || "assist" in obj;

	if (isBelong) {
		out.type = codec.valueChooseType(obj.type);
		if ("dateType" in obj) out.dateType = codec.tableFieldType(obj.dateType);
		return out;
	}

	// 日期值项
	out.type = codec.dateFilterType(obj.type);
	if ("dateType" in obj) out.dateType = codec.tableFieldType(obj.dateType);
	if (isPlainObject(obj.value)) {
		const value = deepClone(obj.value);
		if ("position" in value) {
			value.position = codec.datePosition(value.position);
		}
		out.value = value;
	}
	return out;
}

/** 翻译 between 的单侧（date item 或 null）。 */
function translateBetweenSide(side: unknown, codec: EnumCodec): unknown {
	if (side === null || side === undefined) return side;
	if (!isPlainObject(side)) return deepClone(side);
	return translateTypeBearing(side, codec);
}

/**
 * 翻译 FilterItemValue 的 `filterValue`（FilterValue 联合）。按结构分派：
 * - null / 标量（string 等）原样
 * - 含 maxType/minType → NumberBetween（翻译 max/minType）
 * - 含 start/end       → Date/ComposeDate Between（递归两侧）
 * - 含 type            → 带 type 的叶子（Belong / 日期值项）
 * - 其余对象           → 原样深拷贝
 */
function translateFilterValue(value: unknown, codec: EnumCodec): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return deepClone(value);
	const obj = value as Record<string, unknown>;

	if ("maxType" in obj || "minType" in obj) {
		const out = deepClone(obj);
		if ("maxType" in obj) out.maxType = codec.filterValueType(obj.maxType);
		if ("minType" in obj) out.minType = codec.filterValueType(obj.minType);
		return out;
	}

	if ("start" in obj || "end" in obj) {
		const out = deepClone(obj);
		if ("start" in obj) out.start = translateBetweenSide(obj.start, codec);
		if ("end" in obj) out.end = translateBetweenSide(obj.end, codec);
		return out;
	}

	if ("type" in obj) {
		return translateTypeBearing(obj, codec);
	}

	return deepClone(obj);
}

function translateFilterItemValue(
	v: FilterItemValue | CanonicalFilterItemValue,
	codec: EnumCodec,
): Record<string, unknown> {
	const { filterType, filterValue, filterValueType, fieldId, ...rest } =
		v as Record<string, unknown>;
	const out: Record<string, unknown> = {
		...deepClone(rest),
		filterType: codec.filterType(filterType),
	};
	// fieldId 是 groupId 引用（聚合后的目标），翻译其整数/别名指纹；
	// null/undefined（条件格式的 "this"）或非字符串原样保留。
	if ("fieldId" in (v as object)) {
		out.fieldId =
			typeof fieldId === "string" ? codec.groupId(fieldId) : fieldId;
	}
	if (filterValueType !== undefined) {
		out.filterValueType = codec.filterValueType(filterValueType);
	}
	if ("filterValue" in (v as object)) {
		out.filterValue = translateFilterValue(filterValue, codec);
	}
	return out;
}

function translateFilterItemType(
	node: FilterItemType | CanonicalFilterItemType,
	codec: EnumCodec,
): Record<string, unknown> {
	const { filterType, filterValue, ...rest } = node as Record<string, unknown>;
	const list = Array.isArray(filterValue) ? filterValue : [];
	return {
		...deepClone(rest),
		filterType: codec.filterType(filterType),
		filterValue: list.map((item) =>
			translateFilterItemValue(item as FilterItemValue, codec),
		),
	};
}

export function filterToCanonical(
	filter: FilterItemType[],
): CanonicalFilterItemType[] {
	return filter.map(
		(node) =>
			translateFilterItemType(node, TO_CANONICAL) as CanonicalFilterItemType,
	);
}

export function filterFromCanonical(
	filter: CanonicalFilterItemType[],
): FilterItemType[] {
	return filter.map(
		(node) =>
			translateFilterItemType(node, FROM_CANONICAL) as unknown as FilterItemType,
	);
}

/* ============================================================
 * 单个 FilterItemValue 的翻译（供 conditionFormat 复用）
 * ============================================================ */

export function filterItemValueToCanonical(
	v: FilterItemValue,
): CanonicalFilterItemValue {
	return translateFilterItemValue(v, TO_CANONICAL) as CanonicalFilterItemValue;
}

export function filterItemValueFromCanonical(
	v: CanonicalFilterItemValue,
): FilterItemValue {
	return translateFilterItemValue(
		v,
		FROM_CANONICAL,
	) as unknown as FilterItemValue;
}
