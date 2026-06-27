import { deepClone } from "./clone";
import {
	type EncodingFieldSnapshot,
	encodingFieldFromCanonical,
	encodingFieldToCanonical,
} from "./encodingField";
import type { CanonicalEncodingField, CanonicalGeomSeries } from "./types";

/**
 * snapshot 上 GeomSeriesModel 的形态。`type` 已经是字符串 GeomTypes；
 * `attributes` 内部可能挂着 EncodingFieldModel 实例（color/text/tooltip 等
 * GeomBaseAttribute<T> 的 `fields` 数组），需要逐个翻译 enum。
 */
export interface GeomSeriesSnapshot {
	$modelType?: string;
	$modelId?: string;
	field: string;
	type: string;
	attributes: Record<string, unknown>;
}

function mapAttributes(
	attrs: Record<string, unknown>,
	mapField: (f: unknown) => unknown,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(attrs)) {
		if (v === null || typeof v !== "object" || Array.isArray(v)) {
			out[k] = deepClone(v);
			continue;
		}
		const obj = v as Record<string, unknown>;
		if (!Array.isArray(obj.fields)) {
			out[k] = deepClone(obj);
			continue;
		}
		const { fields, ...rest } = obj;
		out[k] = {
			fields: (fields as unknown[]).map(mapField),
			...deepClone(rest),
		};
	}
	return out;
}

export function geomSeriesToCanonical(
	geom: GeomSeriesSnapshot,
): CanonicalGeomSeries {
	return {
		...(geom.$modelType ? { $modelType: geom.$modelType } : {}),
		...(geom.$modelId ? { $modelId: geom.$modelId } : {}),
		field: geom.field,
		type: geom.type,
		attributes: mapAttributes(geom.attributes, (f) =>
			encodingFieldToCanonical(f as EncodingFieldSnapshot),
		),
	};
}

export function geomSeriesFromCanonical(
	geom: CanonicalGeomSeries,
): GeomSeriesSnapshot {
	return {
		...(geom.$modelType ? { $modelType: geom.$modelType } : {}),
		...(geom.$modelId ? { $modelId: geom.$modelId } : {}),
		field: geom.field,
		type: geom.type,
		attributes: mapAttributes(geom.attributes, (f) =>
			encodingFieldFromCanonical(f as CanonicalEncodingField),
		),
	};
}
