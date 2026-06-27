import type {
	CanonicalFilterItemType,
	CanonicalFilterItemValue,
} from "../canonical";
import { deepClone } from "../canonical/clone";
import type { FieldsContext } from "./context";
import { groupIdFromSurface, groupIdToSurface } from "./groupId";

/**
 * 顶层 filter 的 surface 转换：把每个叶子的 `fieldId`（聚合后的 groupId 引用）
 * 在 canonical 别名指纹与 surface 紧凑 `alias:agg` 之间映射。操作符（filterType）
 * 与值已在 canonical 层别名化，这里只动 groupId 引用。
 *
 * `fieldId` 为 null/undefined（条件格式的 "this"）或非字符串时原样保留。
 */
type GroupIdMapper = (id: string, ctx: FieldsContext) => string;

function mapLeaf(
	leaf: CanonicalFilterItemValue,
	fieldsCtx: FieldsContext,
	mapId: GroupIdMapper,
): CanonicalFilterItemValue {
	const out = deepClone(leaf);
	if (typeof leaf.fieldId === "string") {
		out.fieldId = mapId(leaf.fieldId, fieldsCtx);
	}
	return out;
}

function mapNode(
	node: CanonicalFilterItemType,
	fieldsCtx: FieldsContext,
	mapId: GroupIdMapper,
): CanonicalFilterItemType {
	const { filterValue, ...rest } = node;
	return {
		...deepClone(rest),
		filterValue: (filterValue ?? []).map((leaf) =>
			mapLeaf(leaf, fieldsCtx, mapId),
		),
	} as CanonicalFilterItemType;
}

export function filterToSurface(
	filter: CanonicalFilterItemType[],
	fieldsCtx: FieldsContext,
): CanonicalFilterItemType[] {
	return filter.map((node) => mapNode(node, fieldsCtx, groupIdToSurface));
}

export function filterFromSurface(
	filter: CanonicalFilterItemType[],
	fieldsCtx: FieldsContext,
): CanonicalFilterItemType[] {
	return filter.map((node) => mapNode(node, fieldsCtx, groupIdFromSurface));
}
