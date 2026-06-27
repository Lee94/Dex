/**
 * 深拷贝。Node 17+ / 现代浏览器原生支持 structuredClone。
 * 这里用 structuredClone 而不是 JSON 序列化，避免丢失 Date / Map / Set 等结构。
 * snapshot 数据本身是 JSON-safe 的，但 structuredClone 在性能和正确性上都更好。
 */
export function deepClone<T>(value: T): T {
	return structuredClone(value);
}
