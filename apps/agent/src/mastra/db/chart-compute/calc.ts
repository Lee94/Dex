/**
 * Translate a measure's `calculation.type` (post-aggregation window calc) into a SQL
 * window expression over the aggregation layer's output alias. A measure with a calc is
 * **replaced** by its derived value (percent / rank / running total) in an outer SELECT
 * that wraps the aggregation (see the orchestrator's calc layer).
 *
 * v1 semantics are **global** (no per-series partition): PERCENT is a share of the grand
 * total, RANK ranks across all rows, ACCUMULATE is a running total ordered by the
 * dimensions. Per-series (column-shelf) partitioning is a known simplification.
 */
import { CALC, type FieldRef } from './types';

export interface CompiledCalc {
  /** Output alias (c1, c2, …) → the window expression that replaces it in the outer SELECT. */
  exprByAlias: Map<string, string>;
  warnings: string[];
}

export function compileCalculations(measures: FieldRef[], dimAliases: string[]): CompiledCalc {
  const exprByAlias = new Map<string, string>();
  const warnings: string[] = [];

  for (const m of measures) {
    const type = m.col.calculation?.type ?? CALC.NONE;
    if (type === CALC.NONE) continue;
    const a = m.alias;
    switch (type) {
      case CALC.PERCENT:
        // Share of the grand total; NULLIF guards an all-zero total.
        exprByAlias.set(a, `${a} * 1.0 / NULLIF(SUM(${a}) OVER (), 0)`);
        break;
      case CALC.RANK_ASC:
        exprByAlias.set(a, `RANK() OVER (ORDER BY ${a} ASC)`);
        break;
      case CALC.RANK_DESC:
        exprByAlias.set(a, `RANK() OVER (ORDER BY ${a} DESC)`);
        break;
      case CALC.ACCUMULATE:
        if (dimAliases.length === 0) {
          warnings.push('an accumulate calc has no dimension to order by and was skipped');
          break;
        }
        exprByAlias.set(
          a,
          `SUM(${a}) OVER (ORDER BY ${dimAliases.join(', ')} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
        );
        break;
      default:
        warnings.push(`unsupported calculation (type ${type}) was skipped`);
    }
  }

  return { exprByAlias, warnings };
}
