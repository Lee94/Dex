import {
	formatFieldGroupCanonicalKey,
	parseFieldGroupCanonicalKey,
	type ParsedFieldGroupKey,
} from "../canonical/fieldGroupConfigs";
import {
	type CalculationAlias,
	calculationAliasMap,
	type GroupAlias,
	groupAliasMap,
	type SummaryAlias,
	summaryAliasMap,
} from "../registry";
import type { FieldsContext } from "./context";

/**
 * groupId 引用的 surface 紧凑化（canonical 别名指纹 ↔ surface 紧凑 `alias:agg`）。
 *
 * groupId = `源字段名$$group$$summary$$calc`（聚合后的过滤/排序目标）。canonical 层
 * 已把整数翻译为别名指纹（`销售额$$none$$sum$$none`）；surface 层进一步借 fields 表
 * 把源字段名换成 alias，并压成与 fieldGroupConfigs key 完全一致的紧凑形态：
 *   "销售额$$none$$sum$$none" → "sales:sum"
 *   "区域$$same$$none$$none"  → "region:same"
 *
 * 找不到 alias / 无法解析时原样返回 canonical 形态（孤立引用仍可往返）。
 *
 * 这些 helper 同时被 fieldGroupConfigs（key 映射）、filter（fieldId）、sort（id /
 * dependField）复用，保证三处对 groupId 的表示完全一致。
 */

/** 从解析后的 canonical key + alias 构造紧凑 key；不满足紧凑约定时返回 null。 */
export function compactKeyFromParsed(
	parsed: ParsedFieldGroupKey,
	alias: string,
): string | null {
	const groupIsNone = parsed.group === "none";
	const summaryIsNone = parsed.summary === "none";
	const calcIsNone = parsed.calc === "none";

	// 紧凑形态约定（与字段引用一致）：
	//   group=none, summary=none, calc=none → "alias"
	//   group=none, summary≠none           → "alias:summary[:calc]"
	//   group≠none, summary=none, calc=none → "alias:group"（含 group=same）
	//   其余组合                            → 退化为 canonical $$ key
	if (groupIsNone && summaryIsNone && calcIsNone) {
		return alias;
	}
	if (groupIsNone && !summaryIsNone) {
		return calcIsNone
			? `${alias}:${parsed.summary}`
			: `${alias}:${parsed.summary}:${parsed.calc}`;
	}
	if (!groupIsNone && summaryIsNone && calcIsNone) {
		return `${alias}:${parsed.group}`;
	}
	return null;
}

/** 紧凑 surface key → parsed canonical key（需要 fields 表）。无法解析返回 null。 */
export function parsedFromCompactKey(
	key: string,
	fieldsCtx: FieldsContext,
): ParsedFieldGroupKey | null {
	const parts = key.split(":");
	if (parts.length < 1 || parts.length > 3) return null;
	const [alias, token1, token2] = parts;
	const def = fieldsCtx.aliasToDef.get(alias);
	if (!def) return null;

	let summary: SummaryAlias = "none";
	let group: GroupAlias = "none";
	let calc: CalculationAlias = "none";

	if (token1 !== undefined) {
		// 优先级：summary > group > calc（与 fieldRef.resolveToken 一致）
		if (summaryAliasMap.hasStr(token1)) summary = token1 as SummaryAlias;
		else if (groupAliasMap.hasStr(token1)) group = token1 as GroupAlias;
		else if (calculationAliasMap.hasStr(token1))
			calc = token1 as CalculationAlias;
		else return null;
	}
	if (token2 !== undefined) {
		if (!calculationAliasMap.hasStr(token2)) return null;
		calc = token2 as CalculationAlias;
	}
	return { sourceName: def.from, group, summary, calc };
}

/** 找到 sourceName 对应的第一个 alias（type 不参与匹配，groupId 不含 type）。 */
function findAliasBySourceName(
	sourceName: string,
	fieldsCtx: FieldsContext,
): string | undefined {
	for (const [alias, def] of fieldsCtx.aliasToDef.entries()) {
		if (def.from === sourceName) return alias;
	}
	return undefined;
}

/** canonical groupId（含 $$ 别名指纹）→ surface 紧凑 key；无法映射时原样返回。 */
export function groupIdToSurface(
	canonGroupId: string,
	fieldsCtx: FieldsContext,
): string {
	let parsed: ParsedFieldGroupKey;
	try {
		parsed = parseFieldGroupCanonicalKey(canonGroupId);
	} catch {
		return canonGroupId;
	}
	const alias = findAliasBySourceName(parsed.sourceName, fieldsCtx);
	const compact = alias ? compactKeyFromParsed(parsed, alias) : null;
	return compact ?? canonGroupId;
}

/** surface 紧凑 key → canonical groupId；含 $$ 视为已是 canonical 透传。 */
export function groupIdFromSurface(
	surfKey: string,
	fieldsCtx: FieldsContext,
): string {
	if (surfKey.includes("$$")) return surfKey;
	const parsed = parsedFromCompactKey(surfKey, fieldsCtx);
	if (!parsed) return surfKey;
	return formatFieldGroupCanonicalKey(parsed);
}
