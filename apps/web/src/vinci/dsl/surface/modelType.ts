/**
 * surface → canonical 时需要为结构化子树补回 mobx-keystone 的 $modelType。
 * 这里维护一份从结构位置到 $modelType 字符串的映射。
 *
 * $modelId 我们不主动合成：mobx-keystone 在 fromSnapshot 时会自动生成，且
 * $modelId 是 nonce、不参与语义比较。round-trip 测试时按 $modelId 归一化。
 */

/**
 * 注意：snapshot 中的实际 $modelType 名字来自 @model("...") 装饰器，
 * 不一定与变量/属性名一致。下面这份表已对齐 @vinci/core 的真实注册：
 * - root              → "vinci/root"
 * - table             → "vinci/table"
 * - encoding          → "vinci/encoding"
 * - encodingField     → "vinci/encoding/field"
 * - geomSeries        → "vinci/encoding/geoms/series"
 * - theme             → "vinci/ThemeModel"   ← 注意是大驼峰
 * - settings          → 不是 Model，是 { chart, table } 普通对象，不带 $modelType
 *   - chartSettings   → "vinci/chartSettings"
 *   - tableSettings   → "vinci/tableSettings"
 */
export const MODEL_TYPES = {
	root: "vinci/root",
	table: "vinci/table",
	encoding: "vinci/encoding",
	encodingField: "vinci/encoding/field",
	geomSeries: "vinci/encoding/geoms/series",
	theme: "vinci/ThemeModel",
	chartSettings: "vinci/chartSettings",
	chartLines: "vinci/chartSettings/chartLines",
	tableSettings: "vinci/tableSettings",
} as const;

export type ModelTypeKey = keyof typeof MODEL_TYPES;

/**
 * 递归删除 `$modelId`（mobx-keystone 的 nonce，无业务含义；fromSnapshot 时自动重生）。
 * 返回新结构，不改原值。用于把 passthrough 子树（table/settings/theme）压成 surface
 * 时去掉 id 噪音；`$modelType` 不在此处理（按结构位置单独剥离 / 重建）。
 */
export function stripModelIds(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripModelIds);
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (k === "$modelId") continue;
			out[k] = stripModelIds(v);
		}
		return out;
	}
	return value;
}
