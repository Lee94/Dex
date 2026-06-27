import type { CanonicalFilterItemValue } from "../canonical";
import type { FilterTypeAlias } from "../registry";

/**
 * Surface 条件格式表达式（filter sub-DSL）。
 *
 * 仅对"无字段引用（`this`）+ 数值域 + 固定标量值"这一无歧义子集做字符串糖衣，
 * 对应 DESIGN.md §7.3 的 `"when": "this >= 8000000"`。这一子集天然满足：
 * - 比较符号 `>= <= != > < =` 只出现在 num_* 操作符上（date/cdate 的值是复合
 *   对象，永远走对象回退），因此 `符号 → FilterType` 一一对应，往返无损；
 * - is null / not null / is error / not error 在 `this`（数值连续字段）语境下
 *   固定映射到 num_* 对应项。
 *
 * 其余形态（belong / between / 参数 / 日期 / 含 fieldId 的引用 / 含未知键）一律
 * 回退为对象形式 `{ filter: <canonical 叶子> }`，由调用方处理。
 *
 * conditionFormat 规则里的 filter 叶子 `id` 是 nonce：`when` 形态会丢弃它，
 * expand 时按规则下标确定性重建。因 compact 不读 id，surface↔snapshot 在
 * 权威方向（surface → snapshot → surface）严格恒等。
 */

/** 比较符号（顺序：先长符号，保证解析时 >= 不被 > 抢先匹配）。 */
const COMPARE_SYMBOLS: ReadonlyArray<readonly [FilterTypeAlias, string]> = [
	["num_gte", ">="],
	["num_lte", "<="],
	["num_ne", "!="],
	["num_gt", ">"],
	["num_lt", "<"],
	["num_eq", "="],
];

const SYMBOL_BY_ALIAS = new Map<FilterTypeAlias, string>(COMPARE_SYMBOLS);

/** 无值操作（this is null 等）。 */
const NULLARY_OPS: ReadonlyArray<readonly [FilterTypeAlias, string]> = [
	["num_is_null", "is null"],
	["num_not_null", "not null"],
	["num_is_error", "is error"],
	["num_not_error", "not error"],
];

const NULLARY_TEXT_BY_ALIAS = new Map<FilterTypeAlias, string>(NULLARY_OPS);
const NULLARY_ALIAS_BY_TEXT = new Map<string, FilterTypeAlias>(
	NULLARY_OPS.map(([a, t]) => [t, a]),
);

/** 仅含纯数字字面量（整/负/小数）才允许进比较表达式，避免空格/分隔歧义。 */
const NUMERIC_LITERAL = /^-?\d+(\.\d+)?$/;

const THIS = "this";

/** 只有这些键的 `this` 叶子才考虑压缩；多余键一律对象回退。 */
const KNOWN_LEAF_KEYS = new Set([
	"id",
	"filterType",
	"filterValue",
	"fieldId",
	"filterValueType",
]);

function hasOnlyKnownKeys(leaf: CanonicalFilterItemValue): boolean {
	return Object.keys(leaf).every((k) => KNOWN_LEAF_KEYS.has(k));
}

/**
 * canonical 叶子 → `this ...` 表达式字符串；不可压缩返回 null。
 */
export function leafToWhen(leaf: CanonicalFilterItemValue): string | null {
	// 仅 `this`（无字段引用）
	if (leaf.fieldId !== null && leaf.fieldId !== undefined) return null;
	if (!hasOnlyKnownKeys(leaf)) return null;

	const ft = leaf.filterType;

	// 无值操作
	const nullaryText = NULLARY_TEXT_BY_ALIAS.get(ft);
	if (nullaryText) {
		// 这些操作不应带值
		if (leaf.filterValue === undefined || leaf.filterValue === null) {
			return `${THIS} ${nullaryText}`;
		}
		return null;
	}

	// 比较操作：固定标量数字字面量
	const sym = SYMBOL_BY_ALIAS.get(ft);
	if (sym) {
		if (
			leaf.filterValueType !== undefined &&
			leaf.filterValueType !== "fixed"
		) {
			return null;
		}
		const v = leaf.filterValue;
		if (typeof v === "string" && NUMERIC_LITERAL.test(v)) {
			return `${THIS} ${sym} ${v}`;
		}
		if (typeof v === "number" && Number.isFinite(v)) {
			return `${THIS} ${sym} ${v}`;
		}
	}

	return null;
}

/**
 * `this ...` 表达式 → canonical 叶子片段（不含 id；由调用方补确定性 id）。
 * 解析失败抛错（应只在 leafToWhen 产出的字符串上调用）。
 */
export function whenToLeaf(
	expr: string,
): Omit<CanonicalFilterItemValue, "id"> {
	const trimmed = expr.trim();
	if (!trimmed.startsWith(`${THIS} `) && trimmed !== THIS) {
		throw new Error(`Invalid filter expression (must start with "this"): ${expr}`);
	}
	const rest = trimmed.slice(THIS.length).trim();

	// 无值操作
	const nullaryAlias = NULLARY_ALIAS_BY_TEXT.get(rest);
	if (nullaryAlias) {
		return { filterType: nullaryAlias, fieldId: null, filterValue: null };
	}

	// 比较：<sym> <literal>
	for (const [alias, sym] of COMPARE_SYMBOLS) {
		if (rest.startsWith(sym)) {
			const lit = rest.slice(sym.length).trim();
			if (!NUMERIC_LITERAL.test(lit)) {
				throw new Error(`Invalid numeric literal in "${expr}"`);
			}
			return { filterType: alias, fieldId: null, filterValue: lit };
		}
	}

	throw new Error(`Unrecognized filter expression: ${expr}`);
}

/** 判断一个字符串是否是本模块能解析的 `this` 表达式。 */
export function isWhenExpr(s: string): boolean {
	try {
		whenToLeaf(s);
		return true;
	} catch {
		return false;
	}
}
