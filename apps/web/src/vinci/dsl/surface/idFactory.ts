/**
 * Surface → Canonical 时需要为 EncodingField 合成 id（Surface 不携带 id）。
 *
 * 策略：deterministic、按 alias + 出现序号命名。
 *   - 首次出现 alias="sales"：id = "f-sales"
 *   - 第二次：id = "f-sales-2"
 *   - 第三次：id = "f-sales-3"
 *
 * 这样 surface → canonical → surface 是恒等的（每次 expand 都产生相同 id，
 * 而 compact 不读 id，只读 alias）。
 *
 * 同时也提供 graphic 内部字段的合成（如 $metric 展开时的 metric-name 字段）。
 */
export interface IdFactory {
	forAlias(alias: string): string;
	forMetricName(): string;
}

export function createIdFactory(prefix = "f"): IdFactory {
	const counters = new Map<string, number>();
	const advance = (key: string): string => {
		const n = (counters.get(key) ?? 0) + 1;
		counters.set(key, n);
		return n === 1 ? `${prefix}-${key}` : `${prefix}-${key}-${n}`;
	};
	return {
		forAlias: (alias) => advance(alias),
		forMetricName: () => advance("metric-name"),
	};
}
