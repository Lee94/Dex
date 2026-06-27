import { getDefaultAxisConfig } from "@vinci/core";
import { defaultsDeep } from "lodash-es";
import type { CanonicalFieldConfig, CanonicalFieldConfigs } from "../canonical";
import { deepClone } from "../canonical/clone";
import {
	conditionFormatFromSurface,
	conditionFormatToSurface,
	type SurfaceConditionFormat,
} from "./conditionFormat";
import type { FieldsContext } from "./context";

/**
 * surface 形态的 fieldConfigs：与 canonical 一致，但条件格式 icon/text/dataBar
 * 用 surface 形态（`when` 表达式 + 对象回退）。其余字段（轴/单元格/跳转等）透传。
 *
 * key：canonical/snapshot 用 EncodingField id（如 `f-销售额`），surface 紧凑为
 * 可读别名（fields 表 key，如 `销售额`）。fields 禁止重名 → 别名↔id 唯一双射。
 * 孤立配置（id 不在 encoding）原样保留 key。
 */
export type SurfaceFieldConfig = Omit<
	CanonicalFieldConfig,
	"icon" | "text" | "dataBar"
> & {
	icon?: SurfaceConditionFormat;
	text?: SurfaceConditionFormat;
	dataBar?: SurfaceConditionFormat;
};

export type SurfaceFieldConfigs = Record<string, SurfaceFieldConfig>;

function fieldConfigToSurface(c: CanonicalFieldConfig): SurfaceFieldConfig {
	const { icon, text, dataBar, ...rest } = c;
	const out = deepClone(rest) as SurfaceFieldConfig;
	if (icon !== undefined) out.icon = conditionFormatToSurface(icon);
	if (text !== undefined) out.text = conditionFormatToSurface(text);
	if (dataBar !== undefined) out.dataBar = conditionFormatToSurface(dataBar);
	return out;
}

function fieldConfigFromSurface(c: SurfaceFieldConfig): CanonicalFieldConfig {
	const { icon, text, dataBar, ...rest } = c;
	const out = deepClone(rest) as CanonicalFieldConfig;
	if (icon !== undefined) out.icon = conditionFormatFromSurface(icon);
	if (text !== undefined) out.text = conditionFormatFromSurface(text);
	if (dataBar !== undefined) out.dataBar = conditionFormatFromSurface(dataBar);
	return out;
}

/**
 * snapshot 物化专用：把 fieldConfigs 里**部分**的 valueAxisConfig / categoryAxisConfig
 * 基于 core 默认轴配置补全（`defaultsDeep`），原地修改。
 *
 * 背景：surface 的 `axis` 只写需要覆盖的键（如 `{ reverse: true }`），但 core 渲染层
 * `van-analysis/formatAxes.getValueAxisConfig` 直接读 `settings.domain.type` / `.logBase` /
 * `.reverse`——残缺配置会崩。core 全部 package 模型对部分轴配置一律用
 * `defaultsDeep(partial, getDefaultAxisConfig(isDimension))` 补全，这里照搬。
 *
 * 与 {@link fillFallbackBuckets} 同属 snapshot-only 兜底：**不写回** surface→canonical，
 * 保持 `surface → canonical → surface` 恒等（canonical 只保留用户覆盖项），仅在
 * `surfaceToSnapshot` 物化时补齐完整结构。
 */
export function fillAxisConfigDefaults(configs: CanonicalFieldConfigs): void {
	for (const cfg of Object.values(configs)) {
		const c = cfg as {
			valueAxisConfig?: Record<string, unknown>;
			categoryAxisConfig?: Record<string, unknown>;
		};
		if (c.valueAxisConfig !== undefined) {
			c.valueAxisConfig = defaultsDeep(
				deepClone(c.valueAxisConfig),
				getDefaultAxisConfig(false),
			);
		}
		if (c.categoryAxisConfig !== undefined) {
			c.categoryAxisConfig = defaultsDeep(
				deepClone(c.categoryAxisConfig),
				getDefaultAxisConfig(true),
			);
		}
	}
}

/** Canonical → Surface：key 由 EncodingField id 紧凑为可读别名（孤立 id 原样保留）。 */
export function fieldConfigsToSurface(
	configs: CanonicalFieldConfigs,
	fieldsCtx: FieldsContext,
): SurfaceFieldConfigs {
	const out: SurfaceFieldConfigs = {};
	for (const [id, c] of Object.entries(configs)) {
		const key = fieldsCtx.idToAlias.get(id) ?? id;
		out[key] = fieldConfigToSurface(c);
	}
	return out;
}

/** Surface → Canonical：key 由别名翻译回 EncodingField id（取该别名首个/主字段 id）。 */
export function fieldConfigsFromSurface(
	configs: SurfaceFieldConfigs,
	fieldsCtx: FieldsContext,
): CanonicalFieldConfigs {
	const out: CanonicalFieldConfigs = {};
	for (const [alias, c] of Object.entries(configs)) {
		const id = fieldsCtx.aliasToIds.get(alias)?.[0] ?? alias;
		out[id] = fieldConfigFromSurface(c);
	}
	return out;
}
