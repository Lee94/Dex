export interface AliasMap<TInt extends number, TStr extends string> {
	readonly byInt: Readonly<Record<TInt, TStr>>;
	readonly byStr: Readonly<Record<TStr, TInt>>;
	encode(i: TInt): TStr;
	decode(s: TStr): TInt;
	hasInt(i: number): i is TInt;
	hasStr(s: string): s is TStr;
}

export function createAliasMap<TInt extends number, TStr extends string>(
	entries: ReadonlyArray<readonly [TInt, TStr]>,
): AliasMap<TInt, TStr> {
	const byInt = {} as Record<TInt, TStr>;
	const byStr = {} as Record<TStr, TInt>;
	for (const [i, s] of entries) {
		if (i in byInt) {
			throw new Error(`Duplicate int key: ${i}`);
		}
		if (s in byStr) {
			throw new Error(`Duplicate str key: ${s}`);
		}
		byInt[i] = s;
		byStr[s] = i;
	}
	const hasInt = (v: number): v is TInt => v in byInt;
	const hasStr = (v: string): v is TStr => v in byStr;
	return {
		byInt,
		byStr,
		encode(i) {
			if (!hasInt(i)) {
				throw new Error(`Unknown int alias: ${i}`);
			}
			return byInt[i];
		},
		decode(s) {
			if (!hasStr(s)) {
				throw new Error(`Unknown string alias: ${s}`);
			}
			return byStr[s];
		},
		hasInt,
		hasStr,
	};
}
