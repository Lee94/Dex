import type { FilterItemValue } from "@vinci/core";
import { deepClone } from "./clone";
import {
	type CanonicalFilterItemValue,
	filterItemValueFromCanonical,
	filterItemValueToCanonical,
} from "./filter";

/**
 * Canonical 条件格式（ConditionFormatSetting）。结构与 snapshot 同构，唯一需要
 * 翻译的是每条规则里的 `filter`（一个 FilterItemValue，含 FilterType 等整数 enum）。
 *
 * 其余部分透传：
 * - `result`（textColor / backgroundColor / iconShape / iconColor / color）——
 *   iconShape 已是字符串别名（CONDITION_ICON_SHAPE_MAP_KEYS），无整数 enum
 * - dataBar 特有的 `min` / `max`（DataBarBoundary，type 是 "auto"|"min"|"max"|"custom"
 *   字符串）与 `options`
 *
 * 适用于 4 种条件格式：fieldGroupConfigs.textIcon、fieldConfigs.{icon,text,dataBar}。
 */

export interface CanonicalConditionFormatValue {
	filter: CanonicalFilterItemValue;
	result: unknown;
	[k: string]: unknown;
}

export interface CanonicalConditionFormatSetting {
	value: CanonicalConditionFormatValue[];
	[k: string]: unknown;
}

/** snapshot 端的条件格式形态（filter 是整数 enum 的 FilterItemValue）。 */
export interface SnapshotConditionFormatValue {
	filter: FilterItemValue;
	result: unknown;
	[k: string]: unknown;
}
export interface SnapshotConditionFormatSetting {
	value: SnapshotConditionFormatValue[];
	[k: string]: unknown;
}

export function conditionFormatToCanonical(
	setting: SnapshotConditionFormatSetting,
): CanonicalConditionFormatSetting {
	const { value, ...rest } = setting;
	return {
		...deepClone(rest),
		value: (value ?? []).map((item) => {
			const { filter, ...itemRest } = item;
			return {
				...deepClone(itemRest),
				filter: filterItemValueToCanonical(filter),
			} as CanonicalConditionFormatValue;
		}),
	};
}

export function conditionFormatFromCanonical(
	setting: CanonicalConditionFormatSetting,
): SnapshotConditionFormatSetting {
	const { value, ...rest } = setting;
	return {
		...deepClone(rest),
		value: (value ?? []).map((item) => {
			const { filter, ...itemRest } = item;
			return {
				...deepClone(itemRest),
				filter: filterItemValueFromCanonical(filter),
			} as SnapshotConditionFormatValue;
		}),
	};
}
