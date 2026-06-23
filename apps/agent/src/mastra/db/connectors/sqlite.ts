import { warehouse, WAREHOUSE_PATH } from '../warehouse';
import { assertReadOnly, IDENTIFIER } from '../guard';
import {
  DEFAULT_MAX_ROWS,
  type ColumnInfo,
  type Connector,
  type QueryResult,
  type Row,
  type TableDescription,
  type TableInfo,
} from '../types';

/**
 * The bundled SQLite sample warehouse (`warehouse.db`) — the zero-setup default
 * connector. Read-only safety rests on `assertReadOnly` (single SELECT/WITH);
 * SQLite has no server-side role to drop to, so the guard is the gate.
 */

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

export class SqliteConnector implements Connector {
  readonly dialect = 'sqlite' as const;
  readonly label = `SQLite sample (${WAREHOUSE_PATH})`;

  async listTables(): Promise<TableInfo[]> {
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

  async describeTable(table: string): Promise<TableDescription> {
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

  async runReadOnlySql(sqlRaw: string, maxRows = DEFAULT_MAX_ROWS): Promise<QueryResult> {
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

  async close(): Promise<void> {
    // libsql file client is process-lifetime; nothing to release per-request.
  }
}
