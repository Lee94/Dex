/**
 * Tiny SQL literal/identifier helpers shared by the chart-compute translators.
 * All output is dialect-neutral (SQLite + Postgres both accept it): double-quoted
 * identifiers, single-quoted string literals with embedded quotes doubled, and a
 * backslash `ESCAPE` for LIKE patterns.
 */

/** Quote a SQL identifier (double-quote, escape embedded quotes). */
export const quoteId = (name: string): string => `"${String(name).replace(/"/g, '""')}"`;

/** A single-quoted string literal (embedded `'` doubled). */
export const strLit = (v: unknown): string => `'${String(v).replace(/'/g, "''")}'`;

/**
 * A numeric literal, or `null` if `v` isn't a finite number. Used so a filter value
 * that isn't really numeric is skipped (with a warning) rather than injected raw.
 */
export function numLit(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? String(n) : null;
}

/**
 * A LIKE pattern literal for a contains/begins/ends match. Escapes the SQL LIKE
 * wildcards (`%` `_`) and a literal backslash so the user's text matches literally,
 * then wraps with `%` per the mode. Always paired with `ESCAPE '\'`.
 */
export function likeLit(v: unknown, mode: 'contain' | 'begin' | 'end'): string {
  const escaped = String(v)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/'/g, "''");
  const pattern =
    mode === 'contain' ? `%${escaped}%` : mode === 'begin' ? `${escaped}%` : `%${escaped}`;
  return `'${pattern}' ESCAPE '\\'`;
}
