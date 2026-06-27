import {
	calculationAliasMap,
	groupAliasMap,
	summaryAliasMap,
	tableFieldTypeAliasMap,
} from "../registry";
import { deepClone } from "./clone";
import type { CanonicalEncodingField } from "./types";

/**
 * snapshot 上 EncodingFieldModel 的形态（结构等价于 SnapshotOutOf<EncodingFieldModel>，
 * 但显式列出以避免 DSL 包对 mobx-keystone 类型系统的耦合）。
 *
 * 注意：origin.type 在 snapshot 里是 TABLE_FIELD_TYPES 整数（STRING=16/NUMBER=32/DATE=49 等），
 * 在 canonical 层翻译为字符串别名（"string" / "number" / "date" ...）。
 */
export interface EncodingFieldSnapshot {
	$modelType?: string;
	$modelId?: string;
	id: string;
	origin: { name: string; type: number };
	group: { type: number; value?: unknown };
	summary: { type: number; value?: unknown };
	calculation: { type: number };
	total: { type: "sum" | "avg" | "formula"; value?: string };
	bucketId?: string;
}

export function encodingFieldToCanonical(
	field: EncodingFieldSnapshot,
): CanonicalEncodingField {
	const cloned = deepClone(field) as unknown as CanonicalEncodingField & {
		origin: { name: string; type: unknown };
		group: { type: unknown; value?: unknown };
		summary: { type: unknown; value?: unknown };
		calculation: { type: unknown };
	};
	cloned.origin.type = tableFieldTypeAliasMap.encode(
		field.origin.type as never,
	);
	cloned.group.type = groupAliasMap.encode(field.group.type as never);
	cloned.summary.type = summaryAliasMap.encode(field.summary.type as never);
	cloned.calculation.type = calculationAliasMap.encode(
		field.calculation.type as never,
	);
	return cloned as CanonicalEncodingField;
}

export function encodingFieldFromCanonical(
	field: CanonicalEncodingField,
): EncodingFieldSnapshot {
	const cloned = deepClone(field) as unknown as EncodingFieldSnapshot & {
		origin: { name: string; type: unknown };
		group: { type: unknown; value?: unknown };
		summary: { type: unknown; value?: unknown };
		calculation: { type: unknown };
	};
	cloned.origin.type = tableFieldTypeAliasMap.decode(field.origin.type);
	cloned.group.type = groupAliasMap.decode(field.group.type);
	cloned.summary.type = summaryAliasMap.decode(field.summary.type);
	cloned.calculation.type = calculationAliasMap.decode(field.calculation.type);
	return cloned as EncodingFieldSnapshot;
}
