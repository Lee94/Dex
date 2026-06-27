import {
	formatFieldGroupCanonicalKey,
	formatFieldGroupSnapKey,
	parseFieldGroupCanonicalKey,
	parseFieldGroupKey,
} from "./fieldGroupConfigs";

/**
 * groupId 引用的整数指纹 ↔ 别名指纹翻译。
 *
 * filter 的 `fieldId`、sort 的 `id` / `dependField` 都不是某个 EncodingField 实例 id，
 * 而是**汇总计算后的 groupId**——`源字段名$$group$$summary$$calc`
 * （见 `@vinci/core` 的 `getFieldGroupId`）。过滤/排序作用在聚合结果上，目标由
 * groupId 唯一确定。因此这些引用必须与 fieldGroupConfigs 的 key 走同一套翻译：
 *   snapshot:  "销售额$$0$$1$$0"        （整数）
 *   canonical: "销售额$$none$$sum$$none"（别名）
 *
 * 非 groupId 形态（如普通字段 id、bucketId、空串、非法 4 段）原样返回——
 * 保证对 sort 里偶尔出现的非 groupId id、以及未来字段也无损。
 */

const SEP = "$$";

function isGroupIdShape(s: string): boolean {
	return s.split(SEP).length === 4;
}

export function groupIdToCanonical(fieldId: string): string {
	if (!isGroupIdShape(fieldId)) return fieldId;
	try {
		return formatFieldGroupCanonicalKey(parseFieldGroupKey(fieldId));
	} catch {
		return fieldId;
	}
}

export function groupIdFromCanonical(fieldId: string): string {
	if (!isGroupIdShape(fieldId)) return fieldId;
	try {
		return formatFieldGroupSnapKey(parseFieldGroupCanonicalKey(fieldId));
	} catch {
		return fieldId;
	}
}
