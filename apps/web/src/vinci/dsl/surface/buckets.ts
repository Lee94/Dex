import { isContinuousCalc } from "@vinci/core";
import type {
	CanonicalBucket,
	CanonicalEncoding,
	CanonicalEncodingField,
} from "../canonical";
import {
	groupAliasMap,
	summaryAliasMap,
	tableFieldTypeAliasMap,
} from "../registry";

/**
 * 判断 canonical 字段是否「连续」（落在值轴上的度量）。
 *
 * 直接复用 core 的 `isContinuousCalc`（utils/encoding.ts），避免重复维护「字符串/日期
 * 类字段类型」集合。canonical 字段的 origin/summary/group 是别名，先经 registry 还原为
 * core 整数枚举再判定。core 用 `field.source.type`，这里用 `field.origin.type`——两者只在
 * 日期子类型矫正（date ↔ datetime）时不同，不改变 string-ness，对连续判定等价。
 */
export function isContinuousField(f: CanonicalEncodingField): boolean {
	return isContinuousCalc(
		tableFieldTypeAliasMap.decode(f.origin.type),
		summaryAliasMap.decode(f.summary.type),
		groupAliasMap.decode(f.group.type),
	);
}

type DirectionKey = "cols" | "rows";

function directions(
	enc: CanonicalEncoding,
): Array<{ key: DirectionKey; fields: CanonicalEncodingField[] }> {
	return [
		{ key: "cols", fields: enc.cols },
		{ key: "rows", fields: enc.rows },
	];
}

function findBucket(
	enc: CanonicalEncoding,
	id: string | undefined,
): CanonicalBucket | undefined {
	return id ? enc.buckets.find((b) => b.id === id) : undefined;
}

/**
 * 兜底建桶（surface→snapshot 专用，原地修改 encoding）。
 *
 * surface DSL 省略 `axes` 表时，AGGREGATE（共享值轴）方向下的连续字段没有 bucketId，
 * 而 core 期望它们共享一条值轴。这里镜像 core `changeColDisplayType(AGGREGATE)` /
 * 添加连续字段的行为，给每个 aggregate 方向补一个共享 `main` 桶：
 *
 * - 仅 aggregate 方向；PARALLEL（独立轴）保持 bucketId 留空、不建桶（与 core 一致，
 *   渲染层按 `bucketId ?? 字段id` 各自成轴）。
 * - cols / rows 各自独立，各补一个 main 桶。
 * - 复用该方向已存在的 main 桶（来自显式 axes 声明 + @main 引用）；缺则新建。
 * - 不创建 secondary：副轴仅在字段被显式标到副轴（@secondary / bucket:secondary）时存在。
 * - values 通道不建桶（值轴只来自 cols/rows）。
 *
 * 放在 snapshot 路径而非 surfaceToCanonical，是为了让 `surface→canonical→surface`
 * 仍严格恒等（兜底桶属于 snapshot 物化默认值，不写回紧凑 DSL）。
 * {@link foldableBucketIds} 是它的逆操作。
 */
export function fillFallbackBuckets(enc: CanonicalEncoding): void {
	for (const { key, fields } of directions(enc)) {
		if (enc.config[key].type !== "aggregate") continue;
		const continuous = fields.filter(isContinuousField);
		const unbucketed = continuous.filter((f) => !f.bucketId);
		if (unbucketed.length === 0) continue;
		let main = continuous
			.map((f) => findBucket(enc, f.bucketId))
			.find((b): b is CanonicalBucket => !!b && b.type === "main");
		if (!main) {
			main = { id: `__bucket_${key}_main`, type: "main" };
			enc.buckets.push(main);
		}
		for (const f of unbucketed) f.bucketId = main.id;
	}
}

/**
 * 计算「可折叠回默认」的 bucket id 集合（{@link fillFallbackBuckets} 的逆）。
 *
 * canonical→surface 时，把这些桶从 axes 表里剔除、字段省略 `@alias`，让 surface 紧凑。
 * 折叠条件 = 「fillFallbackBuckets 会原样重建该桶」：
 *   - 桶所在方向是 AGGREGATE；
 *   - 该方向全部连续字段共享同一个桶（方向内只有 1 个值轴桶，无主/副轴拆分）；
 *   - 该桶 type=main 且无 options（带 options 的轴是用户显式配置，必须保留）；
 *   - 该桶不被其它通道/字段引用（不跨 cols/rows/values 共享）。
 * 满足时往返稳定：折叠成裸 DSL → 再编译时 fillFallbackBuckets 重建同形桶。
 */
export function foldableBucketIds(enc: CanonicalEncoding): Set<string> {
	const refCount = new Map<string, number>();
	for (const f of [...enc.cols, ...enc.rows, ...enc.values]) {
		if (f.bucketId) refCount.set(f.bucketId, (refCount.get(f.bucketId) ?? 0) + 1);
	}
	const foldable = new Set<string>();
	for (const { key, fields } of directions(enc)) {
		if (enc.config[key].type !== "aggregate") continue;
		const continuous = fields.filter(isContinuousField);
		if (continuous.length === 0) continue;
		const ids = [...new Set(continuous.map((f) => f.bucketId))];
		if (ids.length !== 1) continue; // 方向内多桶（含 main+secondary）不折叠
		const id = ids[0];
		if (!id) continue; // 存在未绑桶的连续字段
		const bucket = findBucket(enc, id);
		if (!bucket || bucket.type !== "main" || bucket.options) continue;
		if ((refCount.get(id) ?? 0) !== continuous.length) continue; // 被其它字段引用
		foldable.add(id);
	}
	return foldable;
}
