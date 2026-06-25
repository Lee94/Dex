import type { NotebookCell } from './notebooks';

/**
 * Notebook cell execution — chained SQL resolution (v2.0, Hex-style DAG).
 *
 * A cell can reference an upstream cell's `outputName` as if it were a table
 * (`FROM base_orders`). We have no Python/duckdb kernel, so instead of
 * materializing intermediate dataframes we **flatten the dependency DAG into one
 * `WITH` clause**: every upstream cell the target (transitively) references
 * becomes a CTE, emitted in dependency order, with the target as the main query.
 *
 * The composed string is a single SELECT/WITH statement, so it still passes the
 * universal read-only guard in `runReadOnlySql`. Chaining is same-datasource
 * only (cross-source chaining would need a kernel — out of scope).
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Does `source` reference the output name `name` as a bare identifier? */
function references(source: string, name: string): boolean {
  // Word-boundary, case-insensitive (SQLite folds case; Postgres folds unquoted).
  return new RegExp(`\\b${name}\\b`, 'i').test(source);
}

/**
 * Resolve `targetCellId` to a runnable SQL string, inlining any chained upstream
 * cells as CTEs. Throws on an unknown target, a missing reference is simply left
 * to the SQL engine, and a circular reference is reported with a clear message.
 */
export function resolveChainedSql(cells: NotebookCell[], targetCellId: string): string {
  const target = cells.find((c) => c.id === targetCellId);
  if (!target) throw new Error(`Cell "${targetCellId}" is not in this notebook.`);

  // Referenceable cells: those with a valid identifier outputName (first wins on
  // a name collision).
  const byOutput = new Map<string, NotebookCell>();
  for (const c of cells) {
    const name = c.outputName?.trim();
    if (name && IDENTIFIER.test(name) && !byOutput.has(name)) byOutput.set(name, c);
  }

  const depsOf = (cell: NotebookCell): NotebookCell[] => {
    const deps: NotebookCell[] = [];
    for (const [name, dep] of byOutput) {
      if (dep.id !== cell.id && references(cell.source, name)) deps.push(dep);
    }
    return deps;
  };

  // Post-order DFS over the target's transitive dependencies (deps before
  // dependents) with cycle detection.
  const order: NotebookCell[] = [];
  const done = new Set<string>();
  const onPath = new Set<string>();

  const visit = (cell: NotebookCell) => {
    if (done.has(cell.id)) return;
    if (onPath.has(cell.id)) {
      throw new Error(`Circular cell reference involving "${cell.outputName ?? cell.id}".`);
    }
    onPath.add(cell.id);
    for (const dep of depsOf(cell)) visit(dep);
    onPath.delete(cell.id);
    done.add(cell.id);
    order.push(cell);
  };

  for (const dep of depsOf(target)) visit(dep);

  const targetSrc = target.source.trim();
  if (order.length === 0) return targetSrc;

  const ctes = order.map((c) => `${c.outputName} AS (\n${c.source.trim()}\n)`);
  // If the target has its own WITH, merge our CTEs ahead of its.
  const ownWith = /^with\s+/i.exec(targetSrc);
  if (ownWith) {
    return `WITH ${ctes.join(',\n')},\n${targetSrc.slice(ownWith[0].length)}`;
  }
  return `WITH ${ctes.join(',\n')}\n${targetSrc}`;
}
