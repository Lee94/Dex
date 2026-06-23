import { warehouse } from './warehouse';

/**
 * Core warehouse query helpers, kept separate from the Mastra tool wrappers so
 * they can be exercised directly in tests/smoke checks without the LLM.
 */

export type ColumnInfo = {
  name: string;
  type: string;
  notnull: boolean;
  primaryKey: boolean;
};

export type TableInfo = {
  name: string;
  rowCount: number;
};

type Row = Record<string, unknown>;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Turn a libsql result into plain objects keyed by column name. */
function toObjects(columns: string[], rows: unknown[][]): Row[] {
  return rows.map((r) => {
    const obj: Row = {};
    columns.forEach((c, i) => {
      obj[c] = (r as unknown[])[i];
    });
    return obj;
  });
}

/** List user tables in the warehouse along with their row counts. */
export async function listTables(): Promise<TableInfo[]> {
  const res = await warehouse.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const names = res.rows.map((r) => String((r as unknown as unknown[])[0]));

  const tables: TableInfo[] = [];
  for (const name of names) {
    // name comes from sqlite_master, but quote defensively anyway.
    const count = await warehouse.execute(`SELECT COUNT(*) AS n FROM "${name}"`);
    tables.push({ name, rowCount: Number((count.rows[0] as unknown as unknown[])[0]) });
  }
  return tables;
}

/** Describe a single table: its columns plus a few sample rows. */
export async function describeTable(table: string): Promise<{
  table: string;
  columns: ColumnInfo[];
  sampleRows: Row[];
}> {
  if (!IDENTIFIER.test(table)) {
    throw new Error(`Invalid table name: ${JSON.stringify(table)}`);
  }
  const exists = await warehouse.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table],
  });
  if (exists.rows.length === 0) {
    throw new Error(`Table not found: ${table}`);
  }

  const info = await warehouse.execute(`PRAGMA table_info("${table}")`);
  const infoRows = toObjects(info.columns, info.rows as unknown as unknown[][]);
  const columns: ColumnInfo[] = infoRows.map((o) => ({
    name: String(o.name),
    type: String(o.type),
    notnull: Number(o.notnull) === 1,
    primaryKey: Number(o.pk) === 1,
  }));

  const sample = await warehouse.execute(`SELECT * FROM "${table}" LIMIT 5`);
  const sampleRows = toObjects(sample.columns, sample.rows as unknown as unknown[][]);

  return { table, columns, sampleRows };
}

/**
 * Validate that a query is a single, read-only statement. Returns the cleaned
 * SQL (trailing semicolons stripped) or throws with a clear reason.
 */
export function assertReadOnly(sqlRaw: string): string {
  const sql = sqlRaw.trim().replace(/;+\s*$/, '').trim();
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

export type QueryResult = {
  columns: string[];
  rows: Row[];
  rowCount: number;
  truncated: boolean;
};

/** Run a validated read-only query and return columns + rows (capped). */
export async function runReadOnlySql(sqlRaw: string, maxRows = 1000): Promise<QueryResult> {
  const sql = assertReadOnly(sqlRaw);
  const res = await warehouse.execute(sql);
  const columns = res.columns ?? [];
  const allRows = toObjects(columns, res.rows as unknown as unknown[][]);
  const rows = allRows.slice(0, maxRows);
  return {
    columns,
    rows,
    rowCount: allRows.length,
    truncated: allRows.length > maxRows,
  };
}
