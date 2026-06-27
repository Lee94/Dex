import { GROUP_TYPES, type GroupTypes } from "@vinci/core";
import { createAliasMap } from "./createAliasMap";

export type GroupAlias =
	| "none"
	| "same"
	| "y_m_d"
	| "y_m"
	| "y_w"
	| "y_q"
	| "y_cycle"
	| "y"
	| "q"
	| "m"
	| "m_d"
	| "w"
	| "wd"
	| "d"
	| "h"
	| "min"
	| "s"
	| "y_m_d_h_min_s";

export const groupAliasMap = createAliasMap<GroupTypes, GroupAlias>([
	[GROUP_TYPES.NONE, "none"],
	[GROUP_TYPES.SAME, "same"],
	[GROUP_TYPES.Y_M_D, "y_m_d"],
	[GROUP_TYPES.Y_M, "y_m"],
	[GROUP_TYPES.Y_W, "y_w"],
	[GROUP_TYPES.Y_Q, "y_q"],
	[GROUP_TYPES.Y_CYCLE, "y_cycle"],
	[GROUP_TYPES.Y, "y"],
	[GROUP_TYPES.Q, "q"],
	[GROUP_TYPES.M, "m"],
	[GROUP_TYPES.M_D, "m_d"],
	[GROUP_TYPES.W, "w"],
	[GROUP_TYPES.WD, "wd"],
	[GROUP_TYPES.D, "d"],
	[GROUP_TYPES.H, "h"],
	[GROUP_TYPES.MIN, "min"],
	[GROUP_TYPES.S, "s"],
	[GROUP_TYPES.Y_M_D_H_MIN_S, "y_m_d_h_min_s"],
]);
