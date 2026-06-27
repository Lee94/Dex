import { SORT_TYPES, type SortType } from "@vinci/core";
import { createAliasMap } from "./createAliasMap";

export type SortAlias = "none" | "asc" | "desc" | "custom";

export const sortAliasMap = createAliasMap<SortType, SortAlias>([
	[SORT_TYPES.NONE, "none"],
	[SORT_TYPES.ASC, "asc"],
	[SORT_TYPES.DESC, "desc"],
	[SORT_TYPES.CUSTOM, "custom"],
]);
