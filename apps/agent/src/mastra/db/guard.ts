/**
 * The read-only SQL guard — connector-agnostic, runs BEFORE any query reaches a
 * connector (SQLite or Postgres). This is the universal gate every query path
 * (hand-written `run_sql` and the v0.4 semantic-layer compiler) must pass.
 */

/** A valid SQL identifier (table/column name). Used to safely quote names. */
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate that a query is a single, read-only statement. Returns the cleaned
 * SQL (trailing semicolons stripped) or throws with a clear reason.
 */
export function assertReadOnly(sqlRaw: string): string {
  const sql = sqlRaw
    .trim()
    .replace(/;+\s*$/, '')
    .trim();
  if (!sql) {
    throw new Error('Empty SQL query.');
  }
  if (sql.includes(';')) {
    throw new Error('Only a single statement is allowed (no semicolons).');
  }
  if (!/^(select|with)\b/i.test(sql)) {
    throw new Error('Only read-only queries are allowed (must start with SELECT or WITH).');
  }
  if (
    /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|replace|truncate|vacuum|reindex|grant|revoke)\b/i.test(
      sql,
    )
  ) {
    throw new Error('Write and DDL statements are not allowed; this is a read-only connection.');
  }
  return sql;
}
