import type { FilterItemType } from "@vinci/core";
import type { Snapshot } from "../surface/types";
import { deepClone } from "./clone";
import {
	type EncodingSnapshot,
	encodingFromCanonical,
	encodingToCanonical,
} from "./encoding";
import {
	fieldConfigsFromCanonical,
	fieldConfigsToCanonical,
	type SnapshotFieldConfigs,
} from "./fieldConfigs";
import {
	fieldGroupConfigsFromCanonical,
	fieldGroupConfigsToCanonical,
	type SnapshotFieldGroupConfigs,
} from "./fieldGroupConfigs";
import { filterFromCanonical, filterToCanonical } from "./filter";
import {
	type SortValueSnapshot,
	sortFromCanonical,
	sortToCanonical,
} from "./sort";
import { type CanonicalDoc, ScopeError } from "./types";

/**
 * VinciModel snapshot 的形态（结构等价于 SnapshotOutOf<VinciModel>，
 * 显式列出以避免 DSL 包对 mobx-keystone 类型系统的耦合）。
 */
export interface VinciSnapshotLike {
	$modelType?: string;
	$modelId?: string;
	id: string;
	name: string;
	dataVersion: string;
	chartType: string;
	table: unknown;
	encoding: EncodingSnapshot;
	filter: FilterItemType[];
	sort: SortValueSnapshot[];
	metrics: unknown;
	fieldConfigs: SnapshotFieldConfigs;
	fieldGroupConfigs: SnapshotFieldGroupConfigs;
	tableFieldConfigs: unknown;
	settings: unknown;
	theme: unknown;
}

function assertV1Scope(snap: Snapshot): void {
	if (snap.extension != null) {
		throw new ScopeError(
			`extension 不在 DSL v1 覆盖范围。期望 null，实际：${JSON.stringify(snap.extension)}`,
		);
	}
}

export function snapshotToCanonical(snap: Snapshot): CanonicalDoc {
	assertV1Scope(snap);
	return {
		...snap,
		encoding: encodingToCanonical(snap.encoding),
		sort: sortToCanonical(snap.sort ?? []),
		fieldGroupConfigs: fieldGroupConfigsToCanonical(
			snap.fieldGroupConfigs ?? {},
		),
		filter: filterToCanonical(snap.filter ?? []),
		fieldConfigs: fieldConfigsToCanonical(snap.fieldConfigs ?? {}),
		// table：snapshot↔canonical 1:1 passthrough（不翻译字段类型）
		// [dex vendor-compat] @vinci/core dist 的 snapshot 类型 Omit 掉了 table（运行时仍存在），故 cast 读取
		table: deepClone((snap as { table?: unknown }).table),
		metrics: deepClone(snap.metrics),
		tableFieldConfigs: deepClone(snap.tableFieldConfigs),
		settings: deepClone(snap.settings),
		theme: deepClone(snap.theme),
		packageProxy: null,
		extension: null,
	};
}

export function canonicalToSnapshot(doc: CanonicalDoc): VinciSnapshotLike {
	if (doc.packageProxy !== null || doc.extension !== null) {
		throw new ScopeError(
			"Canonical 文档的 packageProxy/extension 必须为 null（v1 范围）",
		);
	}

	return {
		...doc,
		encoding: encodingFromCanonical(doc.encoding),
		sort: sortFromCanonical(doc.sort ?? []),
		fieldGroupConfigs: fieldGroupConfigsFromCanonical(
			doc.fieldGroupConfigs ?? {},
		),
		filter: filterFromCanonical(doc.filter ?? []),
		fieldConfigs: fieldConfigsFromCanonical(doc.fieldConfigs ?? {}),
		table: deepClone(doc.table),
		metrics: deepClone(doc.metrics),
		tableFieldConfigs: deepClone(doc.tableFieldConfigs),
		settings: deepClone(doc.settings),
		theme: deepClone(doc.theme),
	};
}
