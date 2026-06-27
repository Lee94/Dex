import { deepClone } from "./clone";
import {
	encodingFieldFromCanonical,
	type EncodingFieldSnapshot,
	encodingFieldToCanonical,
} from "./encodingField";
import {
	geomSeriesFromCanonical,
	type GeomSeriesSnapshot,
	geomSeriesToCanonical,
} from "./geom";
import type { CanonicalEncoding } from "./types";

export interface EncodingSnapshot {
	$modelType?: string;
	$modelId?: string;
	cols: EncodingFieldSnapshot[];
	rows: EncodingFieldSnapshot[];
	values: EncodingFieldSnapshot[];
	totals: CanonicalEncoding["totals"];
	geoms: {
		series: GeomSeriesSnapshot[];
		graphic: GeomSeriesSnapshot;
	};
	buckets: CanonicalEncoding["buckets"];
	config: CanonicalEncoding["config"];
	forbiddenFields: string[];
}

export function encodingToCanonical(enc: EncodingSnapshot): CanonicalEncoding {
	return {
		...enc,
		cols: enc.cols.map(encodingFieldToCanonical),
		rows: enc.rows.map(encodingFieldToCanonical),
		values: enc.values.map(encodingFieldToCanonical),
		totals: deepClone(enc.totals),
		geoms: {
			series: enc.geoms.series.map(geomSeriesToCanonical),
			graphic: geomSeriesToCanonical(enc.geoms.graphic),
		},
		buckets: deepClone(enc.buckets),
		config: deepClone(enc.config),
		forbiddenFields: [...enc.forbiddenFields],
	};
}

export function encodingFromCanonical(
	enc: CanonicalEncoding,
): EncodingSnapshot {
	return {
		...enc,
		cols: enc.cols.map(encodingFieldFromCanonical),
		rows: enc.rows.map(encodingFieldFromCanonical),
		values: enc.values.map(encodingFieldFromCanonical),
		totals: deepClone(enc.totals),
		geoms: {
			series: enc.geoms.series.map(geomSeriesFromCanonical),
			graphic: geomSeriesFromCanonical(enc.geoms.graphic),
		},
		buckets: deepClone(enc.buckets),
		config: deepClone(enc.config),
		forbiddenFields: [...enc.forbiddenFields],
	};
}
