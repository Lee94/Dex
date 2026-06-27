import type { CanonicalBucket, CanonicalEncodingField } from "../canonical";
import type { SurfaceAxisDef, SurfaceFieldDef } from "./types";
import { SurfaceError } from "./types";

/**
 * Fields 上下文：维护 alias ↔ EncodingField id（或 origin {name,type}）的双向映射。
 *
 * 重要：snapshot 里"同源同聚合"的多个 EncodingField 实例可能 id 不同但 origin 相同。
 * Surface 用 alias 引用 *origin*，每个 alias 对应一个 origin (name,type)。
 *
 * - canonical → surface：扫描所有出现的 origin，分配 alias
 * - surface → canonical：按 alias 反查 origin
 */

export interface FieldsContext {
	/** alias → origin */
	readonly aliasToDef: Map<string, SurfaceFieldDef>;
	/** originKey(name, type) → alias，便于 origin 查 alias */
	readonly originToAlias: Map<string, string>;
	/** EncodingField id → alias（同 origin 的多个 id 都映到同一 alias） */
	readonly idToAlias: Map<string, string>;
	/** alias → 该 alias 对应的所有 EncodingField id（保序） */
	readonly aliasToIds: Map<string, string[]>;
}

/**
 * 把 (name, type) 拼成 originToAlias map 的 key。
 * 用 "|" 作为分隔符以避免空格/null-byte 之类的不可见字符 typo（曾经踩过坑）。
 */
export function originKey(name: string, type: string): string {
	return `${name}|${type}`;
}

/**
 * 从候选名生成合法 alias。
 *
 * 规则：保留 Unicode 字母 / 数字 / 下划线（含中日韩等），把其它字符替换为 _，
 * 空字符串退化为 "field"，开头若为数字加 "f_" 前缀，冲突时追加 _N 后缀。
 *
 * 这意味着中文字段名如 "销售额" 会直接作为 alias 出现——JSON key 允许非 ASCII，
 * 也便于人类直接对照原始数据。
 */
function toAlias(seed: string, used: Set<string>): string {
	let base = seed.replace(/[^\p{L}\p{N}_]/gu, "_");
	base = base.replace(/^_+|_+$/g, "");
	if (/^[0-9]/.test(base)) {
		base = `f_${base}`;
	}
	if (!base) {
		base = "field";
	}
	if (!used.has(base)) {
		used.add(base);
		return base;
	}
	for (let i = 2; ; i++) {
		const cand = `${base}_${i}`;
		if (!used.has(cand)) {
			used.add(cand);
			return cand;
		}
	}
}

/**
 * 从 canonical 的所有 EncodingField 来源处收集 origin，构建 FieldsContext。
 */
export function buildFieldsContextFromCanonical(args: {
	allFields: ReadonlyArray<CanonicalEncodingField>;
	hint?: ReadonlyMap<string, string>;
}): FieldsContext {
	const ctx: FieldsContext = {
		aliasToDef: new Map(),
		originToAlias: new Map(),
		idToAlias: new Map(),
		aliasToIds: new Map(),
	};
	const used = new Set<string>();
	if (args.hint) {
		for (const alias of args.hint.values()) {
			used.add(alias);
		}
	}
	for (const field of args.allFields) {
		const key = originKey(field.origin.name, field.origin.type);
		let alias = ctx.originToAlias.get(key);
		if (!alias) {
			alias = args.hint?.get(key) ?? toAlias(field.origin.name, used);
			ctx.aliasToDef.set(alias, {
				from: field.origin.name,
				type: field.origin.type,
			});
			ctx.originToAlias.set(key, alias);
			ctx.aliasToIds.set(alias, []);
		}
		ctx.idToAlias.set(field.id, alias);
		ctx.aliasToIds.get(alias)?.push(field.id);
	}
	return ctx;
}

/** 给定 surface 的 fields 表，构建反向 FieldsContext。 */
export function buildFieldsContextFromSurface(
	table: Record<string, SurfaceFieldDef> | undefined,
): FieldsContext {
	const ctx: FieldsContext = {
		aliasToDef: new Map(),
		originToAlias: new Map(),
		idToAlias: new Map(),
		aliasToIds: new Map(),
	};
	if (!table) return ctx;
	for (const [alias, def] of Object.entries(table)) {
		if (ctx.aliasToDef.has(alias)) {
			throw new SurfaceError(`Duplicate field alias: ${alias}`);
		}
		ctx.aliasToDef.set(alias, def);
		const k = originKey(def.from, def.type);
		if (ctx.originToAlias.has(k)) {
			throw new SurfaceError(
				`Multiple aliases for same origin (${def.from}:${def.type})`,
			);
		}
		ctx.originToAlias.set(k, alias);
		ctx.aliasToIds.set(alias, []);
	}
	return ctx;
}

/** Axes 上下文：alias ↔ bucket id。 */
export interface AxesContext {
	readonly aliasToBucket: Map<string, CanonicalBucket>;
	readonly idToAlias: Map<string, string>;
}

const DEFAULT_AXIS_ALIAS_BY_POS = {
	main: "main",
	secondary: "secondary",
} as const;

export function buildAxesContextFromCanonical(
	buckets: ReadonlyArray<CanonicalBucket>,
): AxesContext {
	const ctx: AxesContext = {
		aliasToBucket: new Map(),
		idToAlias: new Map(),
	};
	const used = new Set<string>();
	const byPos: Record<"main" | "secondary", CanonicalBucket[]> = {
		main: [],
		secondary: [],
	};
	for (const b of buckets) {
		byPos[b.type].push(b);
	}
	for (const pos of ["main", "secondary"] as const) {
		const list = byPos[pos];
		if (list.length === 1) {
			const alias = DEFAULT_AXIS_ALIAS_BY_POS[pos];
			used.add(alias);
			ctx.aliasToBucket.set(alias, list[0]);
			ctx.idToAlias.set(list[0].id, alias);
		}
	}
	for (const pos of ["main", "secondary"] as const) {
		const list = byPos[pos];
		if (list.length <= 1) continue;
		for (let i = 0; i < list.length; i++) {
			const alias = i === 0 ? pos : `${pos}_${i + 1}`;
			let chosen = alias;
			while (used.has(chosen)) {
				chosen = `${chosen}_x`;
			}
			used.add(chosen);
			ctx.aliasToBucket.set(chosen, list[i]);
			ctx.idToAlias.set(list[i].id, chosen);
		}
	}
	return ctx;
}

export function buildAxesContextFromSurface(
	table: Record<string, SurfaceAxisDef> | undefined,
): AxesContext {
	const ctx: AxesContext = {
		aliasToBucket: new Map(),
		idToAlias: new Map(),
	};
	if (!table) return ctx;
	for (const [alias, def] of Object.entries(table)) {
		const bucket: CanonicalBucket = {
			id: def.id,
			type: def.pos,
			...(def.options ? { options: def.options } : {}),
		};
		ctx.aliasToBucket.set(alias, bucket);
		ctx.idToAlias.set(def.id, alias);
	}
	return ctx;
}
