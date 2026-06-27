import { deepClone } from "./clone";
import {
	type CanonicalConditionFormatSetting,
	conditionFormatFromCanonical,
	conditionFormatToCanonical,
	type SnapshotConditionFormatSetting,
} from "./conditionFormat";

/**
 * Canonical fieldConfigs（`VinciModel.fieldConfigs: Record<fieldId|bucketId, FieldConfig>`）。
 *
 * FieldConfig 里唯一含整数 enum 的子树是条件格式 `icon` / `text` / `dataBar`
 * （每条规则的 filter 是 FilterItemValue）。其余字段透传：
 * - sharedAxis（AxisPosition "main"|"secondary" 字符串）
 * - categoryAxisConfig / valueAxisConfig（label/domain 等，全字符串/数值/布尔）
 * - cellType（"text"|"image"）、width、geomsSetting（GeomsRelation 字符串）
 * - jumpSetting（其中 field.type 是 TableFieldTypes 整数，但作为 TableField 子结构
 *   与 `table` 子树一致地透传，保持无损）
 */

const CONDITION_KEYS = ["icon", "text", "dataBar"] as const;

export interface SnapshotFieldConfig {
	icon?: SnapshotConditionFormatSetting;
	text?: SnapshotConditionFormatSetting;
	dataBar?: SnapshotConditionFormatSetting;
	[k: string]: unknown;
}

export interface CanonicalFieldConfig {
	icon?: CanonicalConditionFormatSetting;
	text?: CanonicalConditionFormatSetting;
	dataBar?: CanonicalConditionFormatSetting;
	[k: string]: unknown;
}

export type SnapshotFieldConfigs = Record<string, SnapshotFieldConfig>;
export type CanonicalFieldConfigs = Record<string, CanonicalFieldConfig>;

function fieldConfigToCanonical(c: SnapshotFieldConfig): CanonicalFieldConfig {
	const out = deepClone(c) as CanonicalFieldConfig;
	for (const key of CONDITION_KEYS) {
		const setting = c[key];
		if (setting !== undefined) {
			out[key] = conditionFormatToCanonical(setting);
		}
	}
	return out;
}

function fieldConfigFromCanonical(c: CanonicalFieldConfig): SnapshotFieldConfig {
	const out = deepClone(c) as SnapshotFieldConfig;
	for (const key of CONDITION_KEYS) {
		const setting = c[key];
		if (setting !== undefined) {
			out[key] = conditionFormatFromCanonical(setting);
		}
	}
	return out;
}

export function fieldConfigsToCanonical(
	configs: SnapshotFieldConfigs,
): CanonicalFieldConfigs {
	const out: CanonicalFieldConfigs = {};
	for (const [id, c] of Object.entries(configs)) {
		out[id] = fieldConfigToCanonical(c);
	}
	return out;
}

export function fieldConfigsFromCanonical(
	configs: CanonicalFieldConfigs,
): SnapshotFieldConfigs {
	const out: SnapshotFieldConfigs = {};
	for (const [id, c] of Object.entries(configs)) {
		out[id] = fieldConfigFromCanonical(c);
	}
	return out;
}
