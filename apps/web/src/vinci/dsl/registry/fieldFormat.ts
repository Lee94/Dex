import { FF_NUM_LEVELS, type FFNumLevel } from "@vinci/core";
import { createAliasMap } from "./createAliasMap";

export type NumLevelAlias =
	| "thousandth"
	| "percent"
	| "normal"
	| "thousand"
	| "ten_thousand"
	| "million"
	| "hundred_million"
	| "thousand_k"
	| "million_m"
	| "billion_b";

export const numLevelAliasMap = createAliasMap<FFNumLevel, NumLevelAlias>([
	[FF_NUM_LEVELS.THOUSANDTH, "thousandth"],
	[FF_NUM_LEVELS.PERCENT, "percent"],
	[FF_NUM_LEVELS.NORMAL, "normal"],
	[FF_NUM_LEVELS.THOUSAND, "thousand"],
	[FF_NUM_LEVELS.TEN_THOUSAND, "ten_thousand"],
	[FF_NUM_LEVELS.MILLION, "million"],
	[FF_NUM_LEVELS.HUNDRED_MILLION, "hundred_million"],
	[FF_NUM_LEVELS.THOUSAND_K, "thousand_k"],
	[FF_NUM_LEVELS.MILLION_M, "million_m"],
	[FF_NUM_LEVELS.BILLION_B, "billion_b"],
]);
