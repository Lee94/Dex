/**
 * The read-only SQL guard — connector-agnostic, runs BEFORE any query reaches a
 * connector (SQLite or Postgres). This is the universal gate every query path
 * (hand-written `run_sql` and the v0.4 semantic-layer compiler) must pass.
 */

/** A valid SQL identifier (table/column name). Used to safely quote names. */
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Strip SQL comments (line `-- …` and block `/* … *\/`) while respecting
 * single-quoted string literals (so `SELECT '--x'` is left intact). Used to run
 * the structural checks against real code — a query that *starts* with a comment
 * is still a valid read-only SELECT, and a comment containing a word like
 * "update" must not trip the DDL/DML guard. The original SQL (comments intact) is
 * what actually executes; comments are inert to the database.
 */
export function stripSqlComments(sql: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const d = sql[i + 1];
    if (inString) {
      out += c;
      if (c === "'") {
        if (d === "'") {
          out += d;
          i++; // escaped quote inside the literal
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (c === "'") {
      inString = true;
      out += c;
      continue;
    }
    if (c === '-' && d === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++; // land on the '/', the loop's i++ steps past it
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * Validate that a query is a single, read-only statement. Returns the cleaned
 * SQL (trailing semicolons stripped, comments preserved) or throws with a clear
 * reason. Structural checks run against the comment-stripped code so a leading
 * comment or a comment containing a keyword doesn't cause a false rejection.
 */
export function assertReadOnly(sqlRaw: string): string {
  const sql = sqlRaw
    .trim()
    .replace(/;+\s*$/, '')
    .trim();
  if (!sql) {
    throw new Error('Empty SQL query.');
  }
  const code = stripSqlComments(sql)
    .replace(/;+\s*$/, '')
    .trim();
  if (!code) {
    throw new Error('Empty SQL query (only comments).');
  }
  if (code.includes(';')) {
    throw new Error('Only a single statement is allowed (no semicolons).');
  }
  if (!/^(select|with)\b/i.test(code)) {
    throw new Error('Only read-only queries are allowed (must start with SELECT or WITH).');
  }
  if (
    /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|replace|truncate|vacuum|reindex|grant|revoke)\b/i.test(
      code,
    )
  ) {
    throw new Error('Write and DDL statements are not allowed; this is a read-only connection.');
  }
  return sql;
}
