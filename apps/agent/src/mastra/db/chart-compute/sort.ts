/**
 * Translate a vinci `Query.sort` (`SortValue[]`) into ORDER BY terms (over the output
 * aliases c0…cN, which exist in every layer). A directive orders a dimension (`id`),
 * or — when `dependField` is set — orders it **by a measure's aggregate**; CUSTOM
 * orders by an explicit value sequence via a CASE. References that don't resolve to a
 * query column are skipped with a warning.
 */
import { SORT, type FieldRef, type SortValue } from './types';
import { strLit } from './sql';

export interface CompiledSort {
  orderBy: string[];
  warnings: string[];
}

type Resolve = (key: string | null | undefined) => FieldRef | undefined;

export function compileSort(sorts: SortValue[], resolve: Resolve): CompiledSort {
  const orderBy: string[] = [];
  const warnings: string[] = [];

  for (const s of sorts ?? []) {
    if (s.sortType === SORT.NONE) continue;

    if (s.sortType === SORT.CUSTOM) {
      const ref = resolve(s.id);
      if (!ref) {
        warnings.push('a custom sort referenced an unknown field and was skipped');
        continue;
      }
      if (!s.values || s.values.length === 0) {
        warnings.push('a custom sort had no value order and was skipped');
        continue;
      }
      const whens = s.values.map((v, i) => `WHEN ${strLit(v)} THEN ${i}`).join(' ');
      orderBy.push(`CASE ${ref.alias} ${whens} ELSE ${s.values.length} END`);
      continue;
    }

    // ASC/DESC: order by the measure when `dependField` is set ("sort the dimension by
    // this measure"), else by the field named in `id`.
    const ref = resolve(s.dependField) ?? resolve(s.id);
    if (!ref) {
      warnings.push('a sort referenced an unknown field and was skipped');
      continue;
    }
    orderBy.push(`${ref.alias} ${s.sortType === SORT.DESC ? 'DESC' : 'ASC'}`);
  }

  return { orderBy, warnings };
}
