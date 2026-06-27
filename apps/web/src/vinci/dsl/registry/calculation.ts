import { CALCULATION_TYPES, type CalculationTypes } from "@vinci/core";
import { createAliasMap } from "./createAliasMap";

export type CalculationAlias =
	| "none"
	| "percent"
	| "rank_asc"
	| "rank_desc"
	| "accumulate";

export const calculationAliasMap = createAliasMap<
	CalculationTypes,
	CalculationAlias
>([
	[CALCULATION_TYPES.NONE, "none"],
	[CALCULATION_TYPES.PERCENT, "percent"],
	[CALCULATION_TYPES.RANK_ASC, "rank_asc"],
	[CALCULATION_TYPES.RANK_DESC, "rank_desc"],
	[CALCULATION_TYPES.ACCUMULATE, "accumulate"],
]);
