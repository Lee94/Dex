import { TABLE_FIELD_TYPES, type TableFieldTypes } from "@vinci/core";
import { createAliasMap } from "./createAliasMap";

export type TableFieldTypeAlias =
	| "string"
	| "number"
	| "decimal"
	| "datetime"
	| "date"
	| "year_week"
	| "year_month"
	| "year_season"
	| "month_day"
	| "year_period"
	| "address"
	| "location"
	| "user"
	| "user_group"
	| "dept"
	| "dept_group"
	| "phone";

export const tableFieldTypeAliasMap = createAliasMap<
	TableFieldTypes,
	TableFieldTypeAlias
>([
	[TABLE_FIELD_TYPES.STRING, "string"],
	[TABLE_FIELD_TYPES.NUMBER, "number"],
	[TABLE_FIELD_TYPES.DECIMAL, "decimal"],
	[TABLE_FIELD_TYPES.DATE_TIME, "datetime"],
	[TABLE_FIELD_TYPES.DATE, "date"],
	[TABLE_FIELD_TYPES.YEAR_WEEK, "year_week"],
	[TABLE_FIELD_TYPES.YEAR_MONTH, "year_month"],
	[TABLE_FIELD_TYPES.YEAR_SEASON, "year_season"],
	[TABLE_FIELD_TYPES.MONTH_DAY, "month_day"],
	[TABLE_FIELD_TYPES.YEAR_PERIOD, "year_period"],
	[TABLE_FIELD_TYPES.ADDRESS, "address"],
	[TABLE_FIELD_TYPES.LOCATION, "location"],
	[TABLE_FIELD_TYPES.USER, "user"],
	[TABLE_FIELD_TYPES.USER_GROUP, "user_group"],
	[TABLE_FIELD_TYPES.DEPT, "dept"],
	[TABLE_FIELD_TYPES.DEPT_GROUP, "dept_group"],
	[TABLE_FIELD_TYPES.PHONE, "phone"],
]);
