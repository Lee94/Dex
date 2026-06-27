import {
	DateFilterType,
	DatePositionType,
	FilterType,
	FilterValueType,
	ValueChooseType,
} from "@vinci/core";
import { createAliasMap } from "./createAliasMap";

/**
 * FilterType（37+ 种递归判别联合的判别标签）整数 ↔ 字符串别名。
 *
 * 命名约定：`<域>_<操作>`，其中域前缀区分值的承载形态——
 * 同一"操作"（如 between / in / eq）在 number / date / compose-date 上
 * 走不同的 FilterValue 结构，必须用不同别名以保证双向无损：
 *   - str_   文本字段
 *   - num_   数值字段
 *   - date_  日期字段
 *   - cdate_ 复合日期字段（年月/年周/年季 等 group 派生维度）
 *   - sys_   系统字段（SYSTEM_JSON）
 *   - perm_  权限相关
 * 逻辑节点 and/or、公式 formula、占位 empty/empty_formula 无域前缀。
 */
export type FilterTypeAlias =
	| "empty"
	// string
	| "str_in"
	| "str_not_in"
	| "str_contains"
	| "str_not_contains"
	| "str_starts_with"
	| "str_not_starts_with"
	| "str_ends_with"
	| "str_not_ends_with"
	| "str_is_null"
	| "str_not_null"
	| "str_is_error"
	| "str_not_error"
	// number
	| "num_between"
	| "num_not_between"
	| "num_eq"
	| "num_ne"
	| "num_in"
	| "num_not_in"
	| "num_gt"
	| "num_lt"
	| "num_gte"
	| "num_lte"
	| "num_top_n"
	| "num_bottom_n"
	| "num_is_null"
	| "num_not_null"
	| "num_is_error"
	| "num_not_error"
	// date
	| "date_between"
	| "date_not_between"
	| "date_before"
	| "date_after"
	| "date_in"
	| "date_not_in"
	| "date_eq"
	| "date_ne"
	| "date_top_n"
	| "date_bottom_n"
	| "date_is_null"
	| "date_not_null"
	| "date_is_error"
	| "date_not_error"
	// compose date
	| "cdate_in"
	| "cdate_not_in"
	| "cdate_between"
	| "cdate_not_between"
	| "cdate_before"
	| "cdate_after"
	| "cdate_eq"
	| "cdate_ne"
	| "cdate_is_null"
	| "cdate_not_null"
	| "cdate_is_error"
	| "cdate_not_error"
	| "cdate_top_n"
	| "cdate_bottom_n"
	// system json
	| "sys_in"
	| "sys_not_in"
	| "sys_contains"
	| "sys_not_contains"
	| "sys_is_null"
	| "sys_not_null"
	| "sys_starts_with"
	| "sys_not_starts_with"
	| "sys_ends_with"
	| "sys_not_ends_with"
	| "sys_is_error"
	| "sys_not_error"
	// logical / formula
	| "and"
	| "or"
	| "formula"
	| "empty_formula"
	// permission
	| "perm_data_belong_user"
	| "perm_user_belong"
	| "perm_data_belong_value";

export const filterTypeAliasMap = createAliasMap<FilterType, FilterTypeAlias>([
	[FilterType.EMPTY_CONDITION, "empty"],
	// string
	[FilterType.STRING_BELONG_VALUE, "str_in"],
	[FilterType.STRING_NOT_BELONG_VALUE, "str_not_in"],
	[FilterType.STRING_CONTAIN, "str_contains"],
	[FilterType.STRING_NOT_CONTAIN, "str_not_contains"],
	[FilterType.STRING_BEGIN_WITH, "str_starts_with"],
	[FilterType.STRING_NOT_BEGIN_WITH, "str_not_starts_with"],
	[FilterType.STRING_END_WITH, "str_ends_with"],
	[FilterType.STRING_NOT_END_WITH, "str_not_ends_with"],
	[FilterType.STRING_IS_NULL, "str_is_null"],
	[FilterType.STRING_NOT_NULL, "str_not_null"],
	[FilterType.STRING_IS_ERROR_VALUE, "str_is_error"],
	[FilterType.STRING_NOT_ERROR_VALUE, "str_not_error"],
	// number
	[FilterType.NUMBER_BETWEEN, "num_between"],
	[FilterType.NUMBER_NOT_BETWEEN, "num_not_between"],
	[FilterType.NUMBER_EQUAL_TO, "num_eq"],
	[FilterType.NUMBER_NOT_EQUAL_TO, "num_ne"],
	[FilterType.NUMBER_BELONG_VALUE, "num_in"],
	[FilterType.NUMBER_NOT_BELONG_VALUE, "num_not_in"],
	[FilterType.NUMBER_LARGE, "num_gt"],
	[FilterType.NUMBER_SMALL, "num_lt"],
	[FilterType.NUMBER_LARGE_OR_EQUAL, "num_gte"],
	[FilterType.NUMBER_SMALL_OR_EQUAL, "num_lte"],
	[FilterType.NUMBER_TOP_N, "num_top_n"],
	[FilterType.NUMBER_BOTTOM_N, "num_bottom_n"],
	[FilterType.NUMBER_IS_NULL, "num_is_null"],
	[FilterType.NUMBER_NOT_NULL, "num_not_null"],
	[FilterType.NUMBER_IS_ERROR_VALUE, "num_is_error"],
	[FilterType.NUMBER_NOT_ERROR_VALUE, "num_not_error"],
	// date
	[FilterType.DATE_BETWEEN, "date_between"],
	[FilterType.DATE_NOT_BETWEEN, "date_not_between"],
	[FilterType.DATE_LESS_THAN, "date_before"],
	[FilterType.DATE_MORE_THAN, "date_after"],
	[FilterType.DATE_BELONG_VALUE, "date_in"],
	[FilterType.DATE_NOT_BELONG_VALUE, "date_not_in"],
	[FilterType.DATE_EQUAL_TO, "date_eq"],
	[FilterType.DATE_NOT_EQUAL_TO, "date_ne"],
	[FilterType.DATE_TOP_N, "date_top_n"],
	[FilterType.DATE_BOTTOM_N, "date_bottom_n"],
	[FilterType.DATE_IS_NULL, "date_is_null"],
	[FilterType.DATE_NOT_NULL, "date_not_null"],
	[FilterType.DATE_IS_ERROR_VALUE, "date_is_error"],
	[FilterType.DATE_NOT_ERROR_VALUE, "date_not_error"],
	// compose date
	[FilterType.COMPOSE_DATE_BELONG_VALUE, "cdate_in"],
	[FilterType.COMPOSE_DATE_NOT_BELONG_VALUE, "cdate_not_in"],
	[FilterType.COMPOSE_DATE_BETWEEN, "cdate_between"],
	[FilterType.COMPOSE_DATE_NOT_BETWEEN, "cdate_not_between"],
	[FilterType.COMPOSE_DATE_SOONER_THAN, "cdate_before"],
	[FilterType.COMPOSE_DATE_LATER_THAN, "cdate_after"],
	[FilterType.COMPOSE_DATE_EQ, "cdate_eq"],
	[FilterType.COMPOSE_DATE_NOT_EQ, "cdate_ne"],
	[FilterType.COMPOSE_DATE_IS_NULL, "cdate_is_null"],
	[FilterType.COMPOSE_DATE_NOT_NULL, "cdate_not_null"],
	[FilterType.COMPOSE_DATE_IS_ERROR_VALUE, "cdate_is_error"],
	[FilterType.COMPOSE_DATE_NOT_ERROR_VALUE, "cdate_not_error"],
	[FilterType.COMPOSE_DATE_TOP_N, "cdate_top_n"],
	[FilterType.COMPOSE_DATE_BOTTOM_N, "cdate_bottom_n"],
	// system json
	[FilterType.SYSTEM_JSON_BELONG_VALUE, "sys_in"],
	[FilterType.SYSTEM_JSON_NOT_BELONG_VALUE, "sys_not_in"],
	[FilterType.SYSTEM_JSON_CONTAIN, "sys_contains"],
	[FilterType.SYSTEM_JSON_NOT_CONTAIN, "sys_not_contains"],
	[FilterType.SYSTEM_JSON_IS_NULL, "sys_is_null"],
	[FilterType.SYSTEM_JSON_NOT_NULL, "sys_not_null"],
	[FilterType.SYSTEM_JSON_BEGIN_WITH, "sys_starts_with"],
	[FilterType.SYSTEM_JSON_NOT_BEGIN_WITH, "sys_not_starts_with"],
	[FilterType.SYSTEM_JSON_END_WITH, "sys_ends_with"],
	[FilterType.SYSTEM_JSON_NOT_END_WITH, "sys_not_ends_with"],
	[FilterType.SYSTEM_JSON_IS_ERROR_VALUE, "sys_is_error"],
	[FilterType.SYSTEM_JSON_NOT_ERROR_VALUE, "sys_not_error"],
	// logical / formula
	[FilterType.AND, "and"],
	[FilterType.OR, "or"],
	[FilterType.FORMULA, "formula"],
	[FilterType.EMPTY_FORMULA, "empty_formula"],
	// permission
	[FilterType.PERMISSION_DATA_BELONG_USER, "perm_data_belong_user"],
	[FilterType.PERMISSION_USER_BELONG, "perm_user_belong"],
	[FilterType.PERMISSION_DATA_BELONG_VALUE, "perm_data_belong_value"],
]);

/** FilterValueType：固定值 / 参数值。 */
export type FilterValueTypeAlias = "fixed" | "param";

export const filterValueTypeAliasMap = createAliasMap<
	FilterValueType,
	FilterValueTypeAlias
>([
	[FilterValueType.FIXED, "fixed"],
	[FilterValueType.PARAMETER, "param"],
]);

/** ValueChooseType：正选（include）/ 反选（exclude）/ 参数（param）。 */
export type ValueChooseTypeAlias = "include" | "exclude" | "param";

export const valueChooseTypeAliasMap = createAliasMap<
	ValueChooseType,
	ValueChooseTypeAlias
>([
	[ValueChooseType.MULTI, "include"],
	[ValueChooseType.ALL, "exclude"],
	[ValueChooseType.PARAMETER, "param"],
]);

/** DateFilterType：静态时间 / 动态时间 / 参数。 */
export type DateFilterTypeAlias = "static" | "dynamic" | "param";

export const dateFilterTypeAliasMap = createAliasMap<
	DateFilterType,
	DateFilterTypeAlias
>([
	[DateFilterType.STATIC, "static"],
	[DateFilterType.DYNAMIC, "dynamic"],
	[DateFilterType.PARAMETER, "param"],
]);

/** DatePositionType：当前 / 期初 / 期末。 */
export type DatePositionTypeAlias = "current" | "begin" | "end";

export const datePositionTypeAliasMap = createAliasMap<
	DatePositionType,
	DatePositionTypeAlias
>([
	[DatePositionType.CURRENT, "current"],
	[DatePositionType.BEGIN, "begin"],
	[DatePositionType.END, "end"],
]);
