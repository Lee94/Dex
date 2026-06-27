import { SUMMARY_TYPES, type SummaryTypes } from "@vinci/core";
import { createAliasMap } from "./createAliasMap";

export type SummaryAlias =
	| "agg"
	| "none"
	| "sum"
	| "avg"
	| "max"
	| "min"
	| "median"
	| "distinct"
	| "count"
	| "stddev"
	| "variance"
	| "first"
	| "last"
	| "p5"
	| "p10"
	| "p25"
	| "p50"
	| "p75"
	| "p90"
	| "p95";

export const summaryAliasMap = createAliasMap<SummaryTypes, SummaryAlias>([
	[SUMMARY_TYPES.AGG, "agg"],
	[SUMMARY_TYPES.NONE, "none"],
	[SUMMARY_TYPES.SUM, "sum"],
	[SUMMARY_TYPES.AVERAGE, "avg"],
	[SUMMARY_TYPES.MAX, "max"],
	[SUMMARY_TYPES.MIN, "min"],
	[SUMMARY_TYPES.MEDIAN, "median"],
	[SUMMARY_TYPES.DISTINCT, "distinct"],
	[SUMMARY_TYPES.COUNT, "count"],
	[SUMMARY_TYPES.STANDARD_DEVIATION, "stddev"],
	[SUMMARY_TYPES.VARIANCE, "variance"],
	[SUMMARY_TYPES.FIRST, "first"],
	[SUMMARY_TYPES.LAST, "last"],
	[SUMMARY_TYPES.PERCENTILE_5, "p5"],
	[SUMMARY_TYPES.PERCENTILE_10, "p10"],
	[SUMMARY_TYPES.PERCENTILE_25, "p25"],
	[SUMMARY_TYPES.PERCENTILE_50, "p50"],
	[SUMMARY_TYPES.PERCENTILE_75, "p75"],
	[SUMMARY_TYPES.PERCENTILE_90, "p90"],
	[SUMMARY_TYPES.PERCENTILE_95, "p95"],
]);
