import type { CanonicalBucket, CanonicalEncodingField } from "../canonical";
import {
	type CalculationAlias,
	calculationAliasMap,
	type GroupAlias,
	groupAliasMap,
	type SummaryAlias,
	summaryAliasMap,
} from "../registry";
import type { AxesContext, FieldsContext } from "./context";
import type { SurfaceFieldRef, SurfaceFieldRefObject } from "./types";
import { SurfaceError } from "./types";

/**
 * 默认字段总和：total.type === "sum" 且无 total.value。
 * 只有满足此默认的字段才可能压缩为字符串形态。
 */
function isDefaultTotal(total: CanonicalEncodingField["total"]): boolean {
	return total.type === "sum" && total.value === undefined;
}

/**
 * 判断 canonical 字段是否可压缩为字符串。
 *
 * 可压缩的形态（按优先级）：
 * - 仅 summary 非 none：`alias[:summary][:calc]`
 * - 仅 group 非 none：`alias:group`
 * - 全部为 none：`alias`
 *
 * 其余情况（group 和 summary 同时非 none、有 total.value 等）退化为对象。
 */
function tryCompactFieldString(
	field: CanonicalEncodingField,
	alias: string,
	axisAlias: string | undefined,
): string | null {
	if (!isDefaultTotal(field.total)) return null;

	const group = field.group.type;
	const summary = field.summary.type;
	const calc = field.calculation.type;
	const hasGroupValue = field.group.value !== undefined;
	const hasSummaryValue = field.summary.value !== undefined;
	if (hasGroupValue || hasSummaryValue) return null;

	const groupIsNone = group === "none";
	const summaryIsNone = summary === "none";
	const calcIsNone = calc === "none";

	let core: string;
	if (groupIsNone && summaryIsNone && calcIsNone) {
		core = alias;
	} else if (groupIsNone && !summaryIsNone) {
		core = calcIsNone ? `${alias}:${summary}` : `${alias}:${summary}:${calc}`;
	} else if (!groupIsNone && summaryIsNone && calcIsNone) {
		core = `${alias}:${group}`;
	} else {
		return null; // 复杂组合退化为对象
	}

	return axisAlias ? `${core} @${axisAlias}` : core;
}

/**
 * Canonical EncodingField → Surface 字段引用（字符串优先，否则对象）。
 *
 * `axis`：该字段私有轴的 co-located 外观配置（由 compact 层从 fieldConfigs 抽出）。
 * 一旦提供，必须落对象形态（紧凑字符串无法承载 axis）。
 */
export function fieldToSurfaceRef(
	field: CanonicalEncodingField,
	ctx: { fields: FieldsContext; axes: AxesContext },
	axis?: Record<string, unknown>,
): SurfaceFieldRef {
	const alias = ctx.fields.idToAlias.get(field.id);
	if (!alias) {
		throw new SurfaceError(
			`Encoding field with id "${field.id}" has no alias in fields context`,
		);
	}
	const axisAlias = field.bucketId
		? ctx.axes.idToAlias.get(field.bucketId)
		: undefined;
	// 带 axis 配置时不能压缩为字符串
	const compact = axis ? null : tryCompactFieldString(field, alias, axisAlias);
	if (compact !== null) return compact;

	// 对象形态退化
	const obj: SurfaceFieldRefObject = { field: alias };
	if (field.group.type !== "none") obj.group = field.group.type;
	if (field.summary.type !== "none") obj.summary = field.summary.type;
	if (field.calculation.type !== "none") obj.calc = field.calculation.type;
	if (axisAlias) obj.bucket = axisAlias;
	if (!isDefaultTotal(field.total)) obj.total = field.total;
	if (axis) obj.axis = axis;
	return obj;
}

/**
 * 解析紧凑字符串为部件。例：
 *   "sales"              -> { alias: "sales" }
 *   "sales:sum"          -> { alias: "sales", token1: "sum" }
 *   "sales:sum:percent"  -> { alias: "sales", token1: "sum", token2: "percent" }
 *   "sales:sum @main"    -> { alias: "sales", token1: "sum", axis: "main" }
 *   "sales:sum@main"     -> 同上（兼容无空格）
 */
function parseCompactString(s: string): {
	alias: string;
	token1?: string;
	token2?: string;
	axis?: string;
} {
	const atIdx = s.indexOf("@");
	let main = s;
	let axis: string | undefined;
	if (atIdx >= 0) {
		main = s.slice(0, atIdx).trim();
		axis = s.slice(atIdx + 1).trim();
		if (!axis) {
			throw new SurfaceError(`Empty axis alias in "${s}"`);
		}
	}
	const parts = main.split(":").map((p) => p.trim());
	if (parts.length < 1 || parts.length > 3 || parts.some((p) => p === "")) {
		throw new SurfaceError(`Invalid compact field string: "${s}"`);
	}
	return {
		alias: parts[0],
		token1: parts[1],
		token2: parts[2],
		axis,
	};
}

/** 把字符串 token 解析成 summary / group / calc 之一（按优先级）。 */
function resolveToken(token: string): {
	kind: "summary" | "group" | "calc";
	value: SummaryAlias | GroupAlias | CalculationAlias;
} {
	if (summaryAliasMap.hasStr(token)) {
		return { kind: "summary", value: token as SummaryAlias };
	}
	if (groupAliasMap.hasStr(token)) {
		return { kind: "group", value: token as GroupAlias };
	}
	if (calculationAliasMap.hasStr(token)) {
		return { kind: "calc", value: token as CalculationAlias };
	}
	throw new SurfaceError(`Unknown token "${token}"`);
}

/**
 * 解析（或兜底创建）轴别名对应的 bucket，返回其 id。
 *
 * 引用了未声明的 axis alias 时不再报错，而是就地建桶（兜底）：别名 "secondary" 视为
 * 副轴，其余一律主轴。新桶注册进 ctx.axes，后续同别名引用复用同一桶。bucket id 用
 * idFactory 按 `axis-<alias>` 计数生成（与字段 id 命名空间隔离，保持 deterministic）。
 */
function resolveBucketId(
	ctx: { axes: AxesContext },
	axisAlias: string,
	idFactory: (alias: string) => string,
): string {
	let bucket = ctx.axes.aliasToBucket.get(axisAlias);
	if (!bucket) {
		bucket = {
			id: idFactory(`axis-${axisAlias}`),
			type: axisAlias === "secondary" ? "secondary" : "main",
		} satisfies CanonicalBucket;
		ctx.axes.aliasToBucket.set(axisAlias, bucket);
		ctx.axes.idToAlias.set(bucket.id, axisAlias);
	}
	return bucket.id;
}

/**
 * Surface 字段引用 → Canonical EncodingField。
 *
 * 注意：返回的字段会带一个新生成的 id（surface 不携带 id）。
 * 调用方需要在更高层为 fields 表里同 alias 的多个 ids 做去重/复用。
 *
 * MVP 行为：每次出现都生成新的 deterministic id（按 alias + 出现序号）。
 */
export function surfaceRefToField(
	ref: SurfaceFieldRef,
	ctx: { fields: FieldsContext; axes: AxesContext },
	idFactory: (alias: string) => string,
): CanonicalEncodingField {
	if (typeof ref === "string") {
		const parsed = parseCompactString(ref);
		const def = ctx.fields.aliasToDef.get(parsed.alias);
		if (!def) {
			throw new SurfaceError(
				`Field alias "${parsed.alias}" not found in fields table`,
			);
		}
		let summary: SummaryAlias = "none";
		let group: GroupAlias = "none";
		let calc: CalculationAlias = "none";
		if (parsed.token1) {
			const t1 = resolveToken(parsed.token1);
			if (t1.kind === "summary") summary = t1.value as SummaryAlias;
			else if (t1.kind === "group") group = t1.value as GroupAlias;
			else calc = t1.value as CalculationAlias;
		}
		if (parsed.token2) {
			const t2 = resolveToken(parsed.token2);
			if (t2.kind !== "calc") {
				throw new SurfaceError(
					`Second token of "${ref}" must be a calc alias, got ${t2.kind}`,
				);
			}
			calc = t2.value as CalculationAlias;
		}
		let bucketId: string | undefined;
		if (parsed.axis) {
			bucketId = resolveBucketId(ctx, parsed.axis, idFactory);
		}
		return {
			id: idFactory(parsed.alias),
			origin: { name: def.from, type: def.type },
			group: { type: group },
			summary: { type: summary },
			calculation: { type: calc },
			total: { type: "sum" },
			...(bucketId ? { bucketId } : {}),
		};
	}
	// 对象形态
	const def = ctx.fields.aliasToDef.get(ref.field);
	if (!def) {
		throw new SurfaceError(
			`Field alias "${ref.field}" not found in fields table`,
		);
	}
	let bucketId: string | undefined;
	if (ref.bucket) {
		bucketId = resolveBucketId(ctx, ref.bucket, idFactory);
	}
	return {
		id: idFactory(ref.field),
		origin: { name: def.from, type: def.type },
		group: { type: ref.group ?? "none" },
		summary: { type: ref.summary ?? "none" },
		calculation: { type: ref.calc ?? "none" },
		total: ref.total ?? { type: "sum" },
		...(bucketId ? { bucketId } : {}),
	};
}
