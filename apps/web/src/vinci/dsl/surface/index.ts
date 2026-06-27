export * from "./buckets";
export * from "./compact";
export * from "./conditionFormat";
export * from "./context";
export * from "./defaults";
export * from "./encoding";
export * from "./expand";
export * from "./fieldConfigs";
export * from "./fieldGroupConfigs";
export * from "./fieldRef";
export * from "./filter";
export * from "./filterExpr";
export * from "./groupId";
export * from "./idFactory";
export * from "./modelType";
export * from "./settings";
export * from "./sort";
export * from "./types";

// 端到端便捷封装
import { createVinciModel, VinciModel, type VinciSnapshot } from "@vinci/core";
import { mergeWith } from "lodash-es";
import { getSnapshot } from "mobx-keystone";
import type { VinciSnapshotLike } from "../canonical";
import { canonicalToSnapshot, snapshotToCanonical } from "../canonical";
import { fillFallbackBuckets } from "./buckets";
import { canonicalToSurface } from "./compact";
import { surfaceToCanonical } from "./expand";
import { fillAxisConfigDefaults } from "./fieldConfigs";
import { type Snapshot, type SurfaceDoc, SurfaceError } from "./types";

export function snapshotToSurface(snap: Snapshot): SurfaceDoc {
	return canonicalToSurface(snapshotToCanonical(snap));
}

export function surfaceToSnapshot(surf: SurfaceDoc): Snapshot {
	const canonical = surfaceToCanonical(surf);
	// 兜底建 value-axis bucket：仅在 snapshot 物化路径补，使 aggregate 连续字段对齐
	// core 的共享值轴语义；不写回 surfaceToCanonical，保持 surface→canonical→surface 恒等。
	fillFallbackBuckets(canonical.encoding);
	// 补全轴配置：surface 的 `axis` 只写覆盖项（如 {reverse:true}），这里基于 core 默认
	// 把 valueAxisConfig/categoryAxisConfig 补成完整结构，避免渲染层读残缺配置崩溃。
	// 同属 snapshot-only 兜底，不写回 surface→canonical（保持恒等）。
	fillAxisConfigDefaults(canonical.fieldConfigs);
	const generated = canonicalToSnapshot(canonical);
	const snapshot = fixVinciSnapshotLike(generated, canonical.chartType);
	const model = createVinciModel(snapshot as VinciSnapshot);

	if (model.error) {
		throw new SurfaceError(model.error.message);
	}

	return getSnapshot(model);
}

/**
 * 反编译：VinciModel snapshot → DSL（Surface 文档）。
 *
 * 这是 `compile`（{@link dslToSnapshot}）的逆操作，也是 DESIGN §6 的
 * `snapshotToDsl()` few-shot 样例工具。等价于 {@link snapshotToSurface}，
 * 以"编译/反编译"语义命名，便于对外使用。
 */
export function snapshotToDsl(snap: Snapshot): SurfaceDoc {
	return snapshotToSurface(snap);
}

/**
 * 编译：DSL（Surface 文档）→ VinciModel snapshot。
 * 等价于 {@link surfaceToSnapshot}。
 */
export function dslToSnapshot(surf: SurfaceDoc): Snapshot {
	return surfaceToSnapshot(surf);
}

/**
 * 数组整体替换（不按 index 深合并）。surface 产出的 cols/rows/geoms.series/
 * filter/sort 等应整体覆盖空模型的默认空数组，而不是逐项 merge。
 */
function replaceArrays(_dst: unknown, src: unknown): unknown {
	return Array.isArray(src) ? src : undefined;
}

/**
 * core 的 GeomBaseAttribute<T> = T & { fields: EncodingFieldModel[] } 要求每个 geom
 * 属性的 fields 必填。但 DSL 的紧凑形态允许"选项-only"属性（固定色 color:{value}、
 * options:{line:{...}} 等）省略 fields 键。直接 applySnapshot 这种缺 fields 的 snapshot
 * 后，core 的 encoding.allFields 用 `Object.values(attrs).flatMap(a => a.fields)` 裸读时
 * 会塞进 undefined 空洞，进而 onInit 的 sort reaction（sortFields → allFieldsWithoutInternal
 * → field.source）抛 "Cannot read properties of undefined (reading 'source')"——在
 * agent-server 表现为生成 snapshot 时反复报错。
 *
 * 这里在 apply 边界把缺失的 fields 补成 []，让产出 snapshot 符合 core 契约。round-trip
 * 用的 surfaceToSnapshot 不经过此处，保持紧凑形态以维持 surface↔snapshot 严格恒等。
 */
function ensureGeomAttributeFields(snap: VinciSnapshotLike): void {
	const geoms = (
		snap as {
			encoding?: {
				geoms?: {
					graphic?: { attributes?: Record<string, unknown> };
					series?: Array<{ attributes?: Record<string, unknown> }>;
				};
			};
		}
	).encoding?.geoms;
	if (!geoms) return;
	for (const geom of [geoms.graphic, ...(geoms.series ?? [])]) {
		const attrs = geom?.attributes;
		if (!attrs) continue;
		for (const key of Object.keys(attrs)) {
			const attr = attrs[key];
			if (
				attr &&
				typeof attr === "object" &&
				!Array.isArray(attr) &&
				!Array.isArray((attr as { fields?: unknown }).fields)
			) {
				(attr as { fields: unknown[] }).fields = [];
			}
		}
	}
}

/**
 * 补充vinci的必要属性。空白基底用解析后的 chartType（custom/detail/cross），
 * 让 detail/cross 的默认子树与各自 packageProxy 对齐后再合并生成结果。
 */
function fixVinciSnapshotLike(
	generated: VinciSnapshotLike,
	chartType: string,
) {
	const emptySnapshot = new VinciModel({ chartType })
		.snapshot as unknown as VinciSnapshotLike;
	const merged = mergeWith(emptySnapshot, generated, replaceArrays);
	ensureGeomAttributeFields(merged);

	return merged;
}
