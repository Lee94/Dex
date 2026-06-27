import type {
	CanonicalConditionFormatSetting,
	CanonicalFilterItemValue,
} from "../canonical";
import { deepClone } from "../canonical/clone";
import { leafToWhen, whenToLeaf } from "./filterExpr";
import { SurfaceError } from "./types";

/**
 * Surface 条件格式形态（fieldGroupConfigs.textIcon / fieldConfigs.{icon,text,dataBar}）。
 *
 * - 每条规则压缩为 `{ when: "this >= X", result }`（可压缩时），否则
 *   回退 `{ filter: <canonical 叶子>, result }`。
 * - 整体形态：只有 `value` 的设置（textIcon/icon/text）压成裸数组（见 DESIGN §7.3）；
 *   带额外键的（dataBar 的 min/max/options）压成 `{ rules, min, max, options }`。
 */

export interface SurfaceConditionRule {
	/** 可压缩时的表达式（与 filter 二选一）。 */
	when?: string;
	/** 不可压缩时的 canonical 叶子（与 when 二选一）。 */
	filter?: CanonicalFilterItemValue;
	result: unknown;
	[k: string]: unknown;
}

export type SurfaceConditionFormat =
	| SurfaceConditionRule[]
	| ({ rules: SurfaceConditionRule[] } & Record<string, unknown>);

function ruleToSurface(
	item: { filter: CanonicalFilterItemValue; result: unknown; [k: string]: unknown },
): SurfaceConditionRule {
	const { filter, ...rest } = item;
	const when = leafToWhen(filter);
	if (when !== null) {
		return { when, ...(deepClone(rest) as { result: unknown }) };
	}
	return {
		filter: deepClone(filter),
		...(deepClone(rest) as { result: unknown }),
	};
}

function ruleFromSurface(
	rule: SurfaceConditionRule,
	index: number,
): { filter: CanonicalFilterItemValue; result: unknown; [k: string]: unknown } {
	const { when, filter, ...rest } = rule;
	let leaf: CanonicalFilterItemValue;
	if (typeof when === "string") {
		leaf = {
			id: `cf-${index}`,
			...whenToLeaf(when),
		} as CanonicalFilterItemValue;
	} else if (filter !== undefined) {
		leaf = deepClone(filter);
	} else {
		throw new SurfaceError(
			"conditionFormat 规则缺少 `when` 或 `filter`",
		);
	}
	return { filter: leaf, ...(deepClone(rest) as { result: unknown }) };
}

export function conditionFormatToSurface(
	canon: CanonicalConditionFormatSetting,
): SurfaceConditionFormat {
	const { value, ...rest } = canon;
	const rules = (value ?? []).map(ruleToSurface);
	if (Object.keys(rest).length === 0) {
		return rules;
	}
	return { rules, ...deepClone(rest) };
}

export function conditionFormatFromSurface(
	surf: SurfaceConditionFormat,
): CanonicalConditionFormatSetting {
	if (Array.isArray(surf)) {
		return { value: surf.map(ruleFromSurface) };
	}
	const { rules, ...rest } = surf;
	return {
		value: (rules ?? []).map(ruleFromSurface),
		...deepClone(rest),
	};
}
