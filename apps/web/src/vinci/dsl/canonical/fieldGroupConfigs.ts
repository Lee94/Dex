import type {
	CalculationTypes,
	FFNumLevel,
	GroupTypes,
	SummaryTypes,
} from "@vinci/core";
import {
	type CalculationAlias,
	calculationAliasMap,
	type GroupAlias,
	groupAliasMap,
	type NumLevelAlias,
	numLevelAliasMap,
	type SummaryAlias,
	summaryAliasMap,
} from "../registry";
import { deepClone } from "./clone";
import {
	type CanonicalConditionFormatSetting,
	conditionFormatFromCanonical,
	conditionFormatToCanonical,
	type SnapshotConditionFormatSetting,
} from "./conditionFormat";

/**
 * fieldGroupConfigs 的 key 形式：
 * - snapshot: "源名$$<group:int>$$<summary:int>$$<calc:int>"  例: "销售额$$0$$1$$0"
 * - canonical: "源名$$<group:alias>$$<summary:alias>$$<calc:alias>"  例: "销售额$$none$$sum$$none"
 *
 * 分隔符 "$$" 在 @vinci/core 里通过 GROUP_ID_SPLIT_CHAR 定义。
 */
const SEP = "$$";

export interface ParsedFieldGroupKey {
	sourceName: string;
	group: GroupAlias;
	summary: SummaryAlias;
	calc: CalculationAlias;
}

/** 把 snapshot 形态 key 解析为四元组（源名 + 三个别名）。 */
export function parseFieldGroupKey(snapKey: string): ParsedFieldGroupKey {
	const parts = snapKey.split(SEP);
	if (parts.length !== 4) {
		throw new Error(
			`Invalid fieldGroupConfigs key: "${snapKey}" — expected 4 parts split by "$$"`,
		);
	}
	const [sourceName, gStr, sStr, cStr] = parts;
	return {
		sourceName,
		group: groupAliasMap.encode(Number(gStr) as GroupTypes),
		summary: summaryAliasMap.encode(Number(sStr) as SummaryTypes),
		calc: calculationAliasMap.encode(Number(cStr) as CalculationTypes),
	};
}

/** 把四元组拼回 snapshot 形态 key。 */
export function formatFieldGroupSnapKey(p: ParsedFieldGroupKey): string {
	return [
		p.sourceName,
		groupAliasMap.decode(p.group),
		summaryAliasMap.decode(p.summary),
		calculationAliasMap.decode(p.calc),
	].join(SEP);
}

/** canonical 形态 key（与解析结果直接拼装）。 */
export function formatFieldGroupCanonicalKey(p: ParsedFieldGroupKey): string {
	return [p.sourceName, p.group, p.summary, p.calc].join(SEP);
}

/** 把 canonical 形态 key 解析回四元组。 */
export function parseFieldGroupCanonicalKey(
	canonKey: string,
): ParsedFieldGroupKey {
	const parts = canonKey.split(SEP);
	if (parts.length !== 4) {
		throw new Error(
			`Invalid canonical fieldGroupConfigs key: "${canonKey}" — expected 4 parts split by "$$"`,
		);
	}
	const [sourceName, gStr, sStr, cStr] = parts;
	// 校验 alias 存在；不存在则视为孤立 key（fall back to literal）。
	// 这里抛错由调用方决定怎么 fallback。
	if (
		!groupAliasMap.hasStr(gStr) ||
		!summaryAliasMap.hasStr(sStr) ||
		!calculationAliasMap.hasStr(cStr)
	) {
		throw new Error(
			`Canonical key "${canonKey}" 含非法别名（不在 registry 中）`,
		);
	}
	return {
		sourceName,
		group: gStr as GroupAlias,
		summary: sStr as SummaryAlias,
		calc: cStr as CalculationAlias,
	};
}

/* ============================================================
 * format 子树
 * ============================================================ */

export interface SnapshotFormatNumberAuto {
	type: "number_auto";
	numLevel: FFNumLevel;
	suffix: string;
	thousandSeparator: boolean;
}
export interface SnapshotFormatNumber {
	type: "number";
	decimalPlaces: number;
	numLevel: FFNumLevel;
	suffix: string;
	thousandSeparator: boolean;
}
export interface SnapshotFormatPercentage {
	type: "percentage";
	decimalPlaces: number;
	suffix: string;
	thousandSeparator: boolean;
}
export type SnapshotFormat =
	| SnapshotFormatNumberAuto
	| SnapshotFormatNumber
	| SnapshotFormatPercentage;

export interface CanonicalFormatNumberAuto {
	type: "number_auto";
	numLevel: NumLevelAlias;
	suffix: string;
	thousandSeparator: boolean;
}
export interface CanonicalFormatNumber {
	type: "number";
	decimalPlaces: number;
	numLevel: NumLevelAlias;
	suffix: string;
	thousandSeparator: boolean;
}
export interface CanonicalFormatPercentage {
	type: "percentage";
	decimalPlaces: number;
	suffix: string;
	thousandSeparator: boolean;
}
export type CanonicalFormat =
	| CanonicalFormatNumberAuto
	| CanonicalFormatNumber
	| CanonicalFormatPercentage;

function formatToCanonical(f: SnapshotFormat): CanonicalFormat {
	switch (f.type) {
		case "number_auto":
			return { ...f, numLevel: numLevelAliasMap.encode(f.numLevel) };
		case "number":
			return { ...f, numLevel: numLevelAliasMap.encode(f.numLevel) };
		case "percentage":
			return { ...f };
	}
}

function formatFromCanonical(f: CanonicalFormat): SnapshotFormat {
	switch (f.type) {
		case "number_auto":
			return { ...f, numLevel: numLevelAliasMap.decode(f.numLevel) };
		case "number":
			return { ...f, numLevel: numLevelAliasMap.decode(f.numLevel) };
		case "percentage":
			return { ...f };
	}
}

/* ============================================================
 * referenceLines 子树（value 的判别联合）
 * ============================================================ */

export interface SnapshotReferenceLine {
	name: string;
	value:
		| { value: number | null }
		| { summary: { type: SummaryTypes } };
	style: { color: string };
}

export interface CanonicalReferenceLine {
	name: string;
	value:
		| { value: number | null }
		| { summary: { type: SummaryAlias } };
	style: { color: string };
}

function refLineToCanonical(r: SnapshotReferenceLine): CanonicalReferenceLine {
	if ("summary" in r.value) {
		return {
			...r,
			value: {
				summary: { type: summaryAliasMap.encode(r.value.summary.type) },
			},
		};
	}
	return { ...r, value: { ...r.value } };
}

function refLineFromCanonical(
	r: CanonicalReferenceLine,
): SnapshotReferenceLine {
	if ("summary" in r.value) {
		return {
			...r,
			value: {
				summary: { type: summaryAliasMap.decode(r.value.summary.type) },
			},
		};
	}
	return { ...r, value: { ...r.value } };
}

/* ============================================================
 * fieldGroupConfigs 主体
 * ============================================================ */

/**
 * 单个 fieldGroupConfig 项的 snapshot 形态。textIcon 字段含 FilterItemValue
 * 子树，在 P3 后半段（filter sub-DSL）落地前暂作不透明 JSON 透传。
 */
export interface SnapshotFieldGroupConfig {
	displayName?: string;
	format?: SnapshotFormat;
	referenceLines?: SnapshotReferenceLine[];
	/** 条件格式（文本+图标），其中每条规则的 filter 含 FilterType 整数 enum。 */
	textIcon?: SnapshotConditionFormatSetting;
	color?: unknown; // 结构无 enum 整数，passthrough 即可
}

export interface CanonicalFieldGroupConfig {
	displayName?: string;
	format?: CanonicalFormat;
	referenceLines?: CanonicalReferenceLine[];
	textIcon?: CanonicalConditionFormatSetting;
	color?: unknown;
}

export type SnapshotFieldGroupConfigs = Record<string, SnapshotFieldGroupConfig>;
export type CanonicalFieldGroupConfigs = Record<
	string,
	CanonicalFieldGroupConfig
>;

function configToCanonical(
	c: SnapshotFieldGroupConfig,
): CanonicalFieldGroupConfig {
	const out: CanonicalFieldGroupConfig = {};
	if (c.displayName !== undefined) out.displayName = c.displayName;
	if (c.format !== undefined) out.format = formatToCanonical(c.format);
	if (c.referenceLines !== undefined)
		out.referenceLines = c.referenceLines.map(refLineToCanonical);
	if (c.textIcon !== undefined)
		out.textIcon = conditionFormatToCanonical(c.textIcon);
	if (c.color !== undefined) out.color = deepClone(c.color);
	return out;
}

function configFromCanonical(
	c: CanonicalFieldGroupConfig,
): SnapshotFieldGroupConfig {
	const out: SnapshotFieldGroupConfig = {};
	if (c.displayName !== undefined) out.displayName = c.displayName;
	if (c.format !== undefined) out.format = formatFromCanonical(c.format);
	if (c.referenceLines !== undefined)
		out.referenceLines = c.referenceLines.map(refLineFromCanonical);
	if (c.textIcon !== undefined)
		out.textIcon = conditionFormatFromCanonical(c.textIcon);
	if (c.color !== undefined) out.color = deepClone(c.color);
	return out;
}

export function fieldGroupConfigsToCanonical(
	configs: SnapshotFieldGroupConfigs,
): CanonicalFieldGroupConfigs {
	const out: CanonicalFieldGroupConfigs = {};
	for (const [snapKey, c] of Object.entries(configs)) {
		// snapKey 形如 "销售额$$0$$1$$0"，翻译为 canonical key "销售额$$none$$sum$$none"。
		// 解析失败的 key（如非 4 段）抛错，由调用方决定是否容忍。
		const parsed = parseFieldGroupKey(snapKey);
		out[formatFieldGroupCanonicalKey(parsed)] = configToCanonical(c);
	}
	return out;
}

export function fieldGroupConfigsFromCanonical(
	configs: CanonicalFieldGroupConfigs,
): SnapshotFieldGroupConfigs {
	const out: SnapshotFieldGroupConfigs = {};
	for (const [canonKey, c] of Object.entries(configs)) {
		const parsed = parseFieldGroupCanonicalKey(canonKey);
		out[formatFieldGroupSnapKey(parsed)] = configFromCanonical(c);
	}
	return out;
}
