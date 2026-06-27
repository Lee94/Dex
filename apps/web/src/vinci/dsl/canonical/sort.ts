import type { SortType } from "@vinci/core";
import { type SortAlias, sortAliasMap } from "../registry/sort";
import { groupIdFromCanonical, groupIdToCanonical } from "./groupId";

/**
 * snapshot 里的 SortValue 形态（VinciModel.sort 数组项）。
 * 与 @vinci/core 的 SortValue 等价；显式列出以避免依赖耦合。
 *
 * 注意：`id` 与 `dependField` 都是**聚合后的 groupId**（源字段+分组+汇总+计算），
 * 不是 EncodingField 实例 id——排序作用在聚合结果上（见 vinci.model 的 sortFields:
 * `id: f.groupId`）。故与 filter.fieldId 一样走 groupId 整数↔别名翻译。
 *
 * 字段角色约束（聚合场景：图表 / 交叉表）：
 * - `id` 只能是**维度** groupId——「对某维度排序」（vinci.model.sortFields 仅取
 *   `f.isDimension`）。度量不允许出现在 `id`。
 * - `dependField` 只能是**度量** groupId——「该维度按此度量排序」（sortDependFields
 *   取 `!f.isDimension && calc !== ACCUMULATE`），度量永远落在这里。
 * - 例外：明细表（isDetailTable）直接对某列排序，`id` 可为任意非错误字段（含度量），
 *   无 `dependField` 概念。
 */
export interface SortValueSnapshot {
	id?: string;
	sortType: SortType;
	values?: string[];
	dependField?: string | null;
}

/** Canonical：sortType 整数 → 字符串别名；id/dependField 的 groupId 指纹整数 → 别名。 */
export interface CanonicalSortValue {
	id?: string;
	sortType: SortAlias;
	values?: string[];
	dependField?: string | null;
}

export function sortToCanonical(sort: SortValueSnapshot[]): CanonicalSortValue[] {
	return sort.map((s) => ({
		...s,
		sortType: sortAliasMap.encode(s.sortType),
		...(typeof s.id === "string" ? { id: groupIdToCanonical(s.id) } : {}),
		...(typeof s.dependField === "string"
			? { dependField: groupIdToCanonical(s.dependField) }
			: {}),
		...(s.values !== undefined ? { values: [...s.values] } : {}),
	}));
}

export function sortFromCanonical(
	sort: CanonicalSortValue[],
): SortValueSnapshot[] {
	return sort.map((s) => ({
		...s,
		sortType: sortAliasMap.decode(s.sortType),
		...(typeof s.id === "string" ? { id: groupIdFromCanonical(s.id) } : {}),
		...(typeof s.dependField === "string"
			? { dependField: groupIdFromCanonical(s.dependField) }
			: {}),
		...(s.values !== undefined ? { values: [...s.values] } : {}),
	}));
}
