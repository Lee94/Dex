import { GeomAttributeKeysMap } from "@vinci/core";
import { deepClone } from "../canonical/clone";
import { SurfaceError } from "./types";

/**
 * geom 的 `options` 属性与各属性 `GeomAttributesOptions`（去掉 fields 的配置部分）
 * 的 surface 糖衣：
 *
 * snapshot/canonical 里 `options` 按 geom type 再嵌一层（`{ line: {...} }`），
 * 而 geom entry 已带 `type`，故 surface 端压平为 `{ ... }`、expand 时按自身 type 嵌回。
 *
 * 不做默认折叠（见 docs/plan/dsl-geom-options-coverage-v0.1：R3 决策）——
 * 折叠会让 `snapshot → DSL → snapshot` 从结构恒等退化为渲染等价。
 */

/** 全部 geom type 名（同时用于「options 是否为嵌套形态」的判别）。 */
const GEOM_TYPE_NAMES = new Set<string>(Object.keys(GeomAttributeKeysMap));

type FieldSpec =
	| { kind: "bool" }
	| { kind: "number" }
	| { kind: "ratio" } // [0,1] 闭区间
	| { kind: "string" }
	| { kind: "enum"; values: readonly string[] };

/**
 * 各 geom type 的 `options[type]` 合法键与值域，镜像 @vinci/core `types/geom.ts`
 * 的 `OptionsAttribute`（纯 TS 类型，无运行时值可导入，故手动镜像）。
 * areaMap.options 未声明（开放 Record），不在此表 → 不校验、原样透传。
 */
const GEOM_OPTION_SCHEMA: Record<string, Record<string, FieldSpec>> = {
	interval: {
		stack: { kind: "bool" },
		labelPosition: { kind: "enum", values: ["inside", "outside", "center"] },
		roundRadius: { kind: "number" },
	},
	line: {
		stack: { kind: "bool" },
		labelPosition: { kind: "enum", values: ["top", "bottom"] },
		lineType: { kind: "enum", values: ["normal", "curve", "step"] },
		marker: { kind: "bool" },
	},
	area: {
		stack: { kind: "bool" },
		labelPosition: { kind: "enum", values: ["top", "bottom"] },
		lineType: { kind: "enum", values: ["normal", "curve", "step"] },
	},
	rect: {
		stack: { kind: "bool" },
		labelPosition: { kind: "enum", values: ["center", "inside"] },
	},
	point: {
		labelPosition: { kind: "enum", values: ["top", "bottom", "center"] },
	},
	text: {
		fit: { kind: "bool" },
	},
};

/**
 * 各属性 `GeomAttributesOptions`（去掉 fields）的合法键与值域。
 * 事实源：@vinci/core `types/geom.ts` 的 ColorAttribute/SizeAttribute/... 接口。
 * granularity 无配置（GranularityAttribute = unknown）→ 不校验。
 * options 单独走 GEOM_OPTION_SCHEMA。
 */
const GEOM_ATTR_CONFIG_SCHEMA: Record<string, Record<string, FieldSpec>> = {
	color: {
		value: { kind: "string" },
		opacity: { kind: "ratio" },
		gradual: { kind: "bool" },
	},
	size: {
		value: { kind: "ratio" },
	},
	borderColor: {
		type: { kind: "enum", values: ["auto", "custom"] },
		value: { kind: "string" },
	},
	label: {
		enabled: { kind: "bool" },
		allowOverlap: { kind: "bool" },
		adjust: { kind: "enum", values: ["adjust", "hide"] },
	},
	tooltip: {
		enabled: { kind: "bool" },
	},
	text: {
		value: { kind: "string" },
		// layout 是半开放枚举（"default" | ... | string），只校验类型不校验值
		layout: { kind: "string" },
	},
	path: {
		type: { kind: "enum", values: ["normal", "curve", "step"] },
		nullPattern: {
			kind: "enum",
			values: ["continuous", "disconnect", "zero"],
		},
	},
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * surface options 是否为「嵌套形态」（每个键都是 geom type 名或 `fields`）。
 * 嵌套形态来自含异型残留子树或外部构造的 snapshot，原样透传以保无损；
 * 否则视为扁平形态，expand 时按 geom 自身 type 嵌回。
 *
 * 合法的扁平 option 键（stack/labelPosition/lineType/marker/roundRadius/fit）
 * 与 geom type 名（interval/line/...）不相交，判别无歧义。
 */
function isNestedOptions(keys: string[]): boolean {
	return (
		keys.length > 0 &&
		keys.every((k) => k === "fields" || GEOM_TYPE_NAMES.has(k))
	);
}

/**
 * canonical options → surface options（压平）。
 *
 * - `{ [geomType]: {...} }`（可带空 fields）且唯一子树等于 geom 自身 type、非空
 *   → 压平为 `{...}`，丢掉 geom-type 包裹与无意义的 fields:[]
 * - 其它（多子树 / 异型 / 空子树）→ 原样透传（完整嵌套），保证无损
 */
export function compactOptions(value: unknown, geomType: string): unknown {
	if (!isPlainObject(value)) return deepClone(value);
	const { fields: _fields, ...subtrees } = value;
	const subtreeKeys = Object.keys(subtrees);
	const own = subtrees[geomType];
	if (
		subtreeKeys.length === 1 &&
		subtreeKeys[0] === geomType &&
		isPlainObject(own) &&
		Object.keys(own).length > 0
	) {
		return deepClone(own);
	}
	return deepClone(value);
}

/**
 * surface options → canonical options（嵌回）。
 *
 * - 嵌套形态（键全为 geom type / fields）→ 原样透传
 * - 扁平形态 → 包成 `{ [geomType]: {...} }`（不补 fields；apply 链路的
 *   surfaceToSnapshot 会统一补 fields:[]，round-trip 链路保持无 fields）
 * - 空对象 → 视同无 options（canonical `{}`）
 */
export function expandOptions(value: unknown, geomType: string): unknown {
	if (!isPlainObject(value)) return deepClone(value);
	const keys = Object.keys(value);
	if (keys.length === 0) return {};
	if (isNestedOptions(keys)) return deepClone(value);
	return { [geomType]: deepClone(value) };
}

function checkFieldValue(spec: FieldSpec, v: unknown, path: string): void {
	switch (spec.kind) {
		case "bool":
			if (typeof v !== "boolean") {
				throw new SurfaceError(
					`${path} 期望布尔值，实际：${JSON.stringify(v)}`,
				);
			}
			return;
		case "number":
			if (typeof v !== "number" || Number.isNaN(v)) {
				throw new SurfaceError(`${path} 期望数值，实际：${JSON.stringify(v)}`);
			}
			return;
		case "ratio":
			if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 1) {
				throw new SurfaceError(
					`${path} 期望 [0,1] 区间的数值，实际：${JSON.stringify(v)}`,
				);
			}
			return;
		case "string":
			if (typeof v !== "string") {
				throw new SurfaceError(
					`${path} 期望字符串，实际：${JSON.stringify(v)}`,
				);
			}
			return;
		case "enum":
			if (typeof v !== "string" || !spec.values.includes(v)) {
				throw new SurfaceError(
					`${path} 期望 ${spec.values.map((s) => `"${s}"`).join(" | ")} 之一，实际：${JSON.stringify(v)}`,
				);
			}
			return;
	}
}

/** 校验扁平 options 的子键归属与值域（仅扁平形态；嵌套透传形态跳过）。 */
function validateFlatOptions(
	alias: string,
	geomType: string,
	flat: Record<string, unknown>,
): void {
	const schema = GEOM_OPTION_SCHEMA[geomType];
	// areaMap 等无 schema 的 geom：options 开放，不校验
	if (!schema) return;
	for (const [k, v] of Object.entries(flat)) {
		const spec = schema[k];
		if (!spec) {
			throw new SurfaceError(
				`Geom "${alias}"（type ${geomType}）的 options 不支持键 "${k}"；可用：${Object.keys(schema).join(" / ") || "（无）"}`,
			);
		}
		checkFieldValue(spec, v, `geoms.${alias}.options.${k}`);
	}
}

/** 校验某个属性的非 fields 配置键归属与值域。 */
function validateAttrConfig(
	alias: string,
	attrName: string,
	value: unknown,
): void {
	const schema = GEOM_ATTR_CONFIG_SCHEMA[attrName];
	if (!schema || !isPlainObject(value)) return;
	for (const [k, v] of Object.entries(value)) {
		if (k === "fields") continue;
		const spec = schema[k];
		if (!spec) {
			throw new SurfaceError(
				`Geom "${alias}" 的属性 "${attrName}" 不支持配置键 "${k}"；可用：${Object.keys(schema).join(" / ")}`,
			);
		}
		checkFieldValue(spec, v, `geoms.${alias}.${attrName}.${k}`);
	}
}

/**
 * 校验一个 series geom entry（surface→canonical 路径）：
 *  - geom type 合法
 *  - 属性键属于该 geom type（GeomAttributeKeysMap）
 *  - options 子键 + 各属性配置键的归属与枚举/值域
 *
 * 仅校验扁平 options；嵌套透传形态不校验（保无损）。`rest` 不含 `type`。
 */
export function validateSeriesGeom(
	alias: string,
	geomType: string,
	rest: Record<string, unknown>,
): void {
	if (!GEOM_TYPE_NAMES.has(geomType)) {
		throw new SurfaceError(
			`Geom "${alias}" 的 type "${geomType}" 未知；可用：${[...GEOM_TYPE_NAMES].join(" / ")}`,
		);
	}
	const allowed = new Set<string>(
		(GeomAttributeKeysMap as Record<string, readonly string[]>)[geomType] ?? [],
	);
	for (const [attrName, value] of Object.entries(rest)) {
		if (!allowed.has(attrName)) {
			throw new SurfaceError(
				`Geom "${alias}"（type ${geomType}）不支持属性 "${attrName}"；可用：${[...allowed].join(" / ")}`,
			);
		}
		if (attrName === "options") {
			if (isPlainObject(value) && !isNestedOptions(Object.keys(value))) {
				validateFlatOptions(alias, geomType, value);
			}
		} else {
			validateAttrConfig(alias, attrName, value);
		}
	}
}
