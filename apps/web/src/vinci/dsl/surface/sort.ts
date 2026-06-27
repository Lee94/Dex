import type { CanonicalSortValue } from "../canonical";
import { deepClone } from "../canonical/clone";
import type { FieldsContext } from "./context";
import { groupIdFromSurface, groupIdToSurface } from "./groupId";

/**
 * sort 的 surface 转换：`id` 与 `dependField` 都是聚合后的 groupId 引用
 * （见 vinci.model 的 sortFields: `id: f.groupId`），与 filter.fieldId /
 * fieldGroupConfigs key 统一走 groupId 紧凑化。`sortType` 已在 canonical 层别名化。
 */
type GroupIdMapper = (id: string, ctx: FieldsContext) => string;

function mapSort(
	s: CanonicalSortValue,
	fieldsCtx: FieldsContext,
	mapId: GroupIdMapper,
): CanonicalSortValue {
	const out = deepClone(s);
	if (typeof s.id === "string") out.id = mapId(s.id, fieldsCtx);
	if (typeof s.dependField === "string") {
		out.dependField = mapId(s.dependField, fieldsCtx);
	}
	return out;
}

export function sortToSurface(
	sort: CanonicalSortValue[],
	fieldsCtx: FieldsContext,
): CanonicalSortValue[] {
	return sort.map((s) => mapSort(s, fieldsCtx, groupIdToSurface));
}

export function sortFromSurface(
	sort: CanonicalSortValue[],
	fieldsCtx: FieldsContext,
): CanonicalSortValue[] {
	return sort.map((s) => mapSort(s, fieldsCtx, groupIdFromSurface));
}
