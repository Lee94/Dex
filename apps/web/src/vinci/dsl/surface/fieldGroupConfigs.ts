import type {
	CanonicalFieldGroupConfig,
	CanonicalFieldGroupConfigs,
} from "../canonical";
import {
	conditionFormatFromSurface,
	conditionFormatToSurface,
	type SurfaceConditionFormat,
} from "./conditionFormat";
import type { FieldsContext } from "./context";
import { groupIdFromSurface, groupIdToSurface } from "./groupId";

/**
 * fieldGroupConfigs 的 surface 形态。
 *
 * key 是 groupId 引用（聚合后的字段指纹），与 filter.fieldId / sort.id 统一走
 * {@link groupIdToSurface}：
 * - 紧凑形态："sales:sum" / "category:same" / "profit:avg:percent"
 * - 退化形态：fields 表无匹配 alias 时保留 canonical 形态（"销售额$$same$$none$$none"）
 *
 * 与 canonical 的差异仅在 `textIcon` 用 surface 条件格式形态（`when` 表达式 + 对象回退）。
 */
export type SurfaceFieldGroupConfig = Omit<
	CanonicalFieldGroupConfig,
	"textIcon"
> & {
	textIcon?: SurfaceConditionFormat;
};

export type SurfaceFieldGroupConfigs = Record<string, SurfaceFieldGroupConfig>;

/** canonical 配置 → surface 配置（仅 textIcon 需要转换，其余透传）。 */
function configToSurface(
	c: CanonicalFieldGroupConfig,
): SurfaceFieldGroupConfig {
	if (c.textIcon === undefined) return c as SurfaceFieldGroupConfig;
	const { textIcon, ...rest } = c;
	return {
		...rest,
		textIcon: conditionFormatToSurface(textIcon),
	};
}

/** surface 配置 → canonical 配置。 */
function configFromSurface(
	c: SurfaceFieldGroupConfig,
): CanonicalFieldGroupConfig {
	if (c.textIcon === undefined) return c as CanonicalFieldGroupConfig;
	const { textIcon, ...rest } = c;
	return {
		...rest,
		textIcon: conditionFormatFromSurface(textIcon),
	};
}

/** Canonical → Surface：key 走统一的 groupId 紧凑化。 */
export function fieldGroupConfigsToSurface(
	configs: CanonicalFieldGroupConfigs,
	fieldsCtx: FieldsContext,
): SurfaceFieldGroupConfigs {
	const out: SurfaceFieldGroupConfigs = {};
	for (const [canonKey, c] of Object.entries(configs)) {
		out[groupIdToSurface(canonKey, fieldsCtx)] = configToSurface(c);
	}
	return out;
}

/** Surface → Canonical：紧凑 key 转回 canonical groupId（含 $$ 的透传）。 */
export function fieldGroupConfigsFromSurface(
	configs: SurfaceFieldGroupConfigs,
	fieldsCtx: FieldsContext,
): CanonicalFieldGroupConfigs {
	const out: CanonicalFieldGroupConfigs = {};
	for (const [surfKey, c] of Object.entries(configs)) {
		out[groupIdFromSurface(surfKey, fieldsCtx)] = configFromSurface(c);
	}
	return out;
}
