import { GRAPHIC_GEOM_ID, METRIC_NAME } from "@vinci/core";
import type { CanonicalEncoding, CanonicalEncodingField } from "../canonical";

export const INTERNAL_GRAPHIC_GEOM_ID = GRAPHIC_GEOM_ID;
export const INTERNAL_METRIC_NAME = METRIC_NAME;

/**
 * encoding.totals 的默认值（与 EncodingModel 默认完全一致）。
 */
export const DEFAULT_TOTALS: CanonicalEncoding["totals"] = {
	col: { position: "none", grand: true, sub: true },
	row: { position: "none", grand: true, sub: true },
};

export const DEFAULT_CONFIG: CanonicalEncoding["config"] = {
	cols: { type: "aggregate" },
	rows: { type: "aggregate" },
};

/**
 * 严格深度相等（用于默认值折叠判断）。
 * 不递归到 Map/Set/Date 这些特殊结构，但 snapshot 都是 JSON-safe。
 */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
		return false;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) return false;
		}
		return true;
	}
	const ka = Object.keys(a);
	const kb = Object.keys(b);
	if (ka.length !== kb.length) return false;
	for (const k of ka) {
		if (!(k in (b as object))) return false;
		if (
			!deepEqual(
				(a as Record<string, unknown>)[k],
				(b as Record<string, unknown>)[k],
			)
		) {
			return false;
		}
	}
	return true;
}

/**
 * 判断某 geom 的 `color` 属性是否为"按指标名多系列上色"（`$metric` 糖衣的目标形态）：
 * - color 仅含 `fields`（无 value/opacity/gradual 等其它配置）
 * - fields 唯一一个字段，且 origin.name === METRIC_NAME
 *
 * 多系列上色是每个 series geom 各自带 metric-name 色字段（逐图形重复），与 graphic
 * 无关；graphic 只表示无指标时被渲染的图形。
 */
export function isMetricColorAttr(value: unknown): boolean {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const keys = Object.keys(value as object);
	if (keys.length !== 1 || keys[0] !== "fields") return false;
	const fields = (value as { fields?: unknown[] }).fields;
	if (!Array.isArray(fields) || fields.length !== 1) return false;
	const f = fields[0] as { origin?: { name?: string } };
	return f?.origin?.name === INTERNAL_METRIC_NAME;
}

/**
 * 生成 `$metric` 糖衣展开后的 color 属性 `fields`（单个 metric-name 字段）。
 * EncodingField id 由 idFactory 提供（多个 series 各取唯一 id）。
 */
export function makeMetricColorFields(
	idFactory: () => string,
): CanonicalEncodingField[] {
	return [
		{
			id: idFactory(),
			origin: { name: INTERNAL_METRIC_NAME, type: "string" },
			group: { type: "same" },
			summary: { type: "none" },
			calculation: { type: "none" },
			total: { type: "sum" },
		} satisfies CanonicalEncodingField,
	];
}

/** 空 graphic geom（无 $metric 场景）：仅 field + type，无 attributes 项。 */
export function makeEmptyGraphic(): {
	field: string;
	type: string;
	attributes: Record<string, unknown>;
} {
	return {
		field: INTERNAL_GRAPHIC_GEOM_ID,
		type: "interval",
		attributes: {},
	};
}
