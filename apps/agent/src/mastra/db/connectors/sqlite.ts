import { createClient, type Client } from '@libsql/client';
import { warehouse, WAREHOUSE_PATH } from '../warehouse';
import { assertReadOnly, IDENTIFIER } from '../guard';
import {
  DEFAULT_MAX_ROWS,
  type ColumnInfo,
  type ColumnSummary,
  type Connector,
  type QueryResult,
  type Row,
  type TableColumns,
  type TableDescription,
  type TableInfo,
} from '../types';

/**
 * A SQLite warehouse connector. With no argument it binds the bundled sample
 * (`warehouse.db`) — the zero-setup default. Pass a `filePath` (v0.6) to point a
 * user-registered data source at another SQLite file. Read-only safety rests on
 * `assertReadOnly` (single SELECT/WITH); SQLite has no server-side role to drop
 * to, so the guard is the gate.
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
  readonly label: string;
  private client: Client;

  /** No arg → the bundled sample. `filePath` → a user-registered SQLite file. */
  constructor(filePath?: string) {
    if (filePath) {
      this.client = createClient({ url: `file:${filePath}` });
      this.label = `SQLite (${filePath})`;
    } else {
      this.client = warehouse;
      this.label = `SQLite sample (${WAREHOUSE_PATH})`;
    }
  }

  async listTables(): Promise<TableInfo[]> {
    const res = await this.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const names = res.rows.map((r) => String((r as unknown as unknown[])[0]));

    const tables: TableInfo[] = [];
    for (const name of names) {
      // name comes from sqlite_master, but quote defensively anyway.
      const count = await this.client.execute(`SELECT COUNT(*) AS n FROM "${name}"`);
      tables.push({ name, rowCount: Number((count.rows[0] as unknown as unknown[])[0]) });
    }
    return tables;
  }

  async describeTable(table: string): Promise<TableDescription> {
    if (!IDENTIFIER.test(table)) {
      throw new Error(`Invalid table name: ${JSON.stringify(table)}`);
    }
    const exists = await this.client.execute({
      sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
      args: [table],
    });
    if (exists.rows.length === 0) {
      throw new Error(`Table not found: ${table}`);
    }

    const info = await this.client.execute(`PRAGMA table_info("${table}")`);
    const infoRows = toObjects(info.columns, info.rows as unknown as unknown[][]);
    const columns: ColumnInfo[] = infoRows.map((o) => ({
      name: String(o.name),
      type: String(o.type),
      notnull: Number(o.notnull) === 1,
      primaryKey: Number(o.pk) === 1,
    }));

    const sample = await this.client.execute(`SELECT * FROM "${table}" LIMIT 5`);
    const sampleRows = toObjects(sample.columns, sample.rows as unknown as unknown[][]);

    return { table, columns, sampleRows };
  }

  async tableColumns(tables?: string[]): Promise<TableColumns[]> {
    const names = tables ?? (await this.listTables()).map((t) => t.name);
    const out: TableColumns[] = [];
    for (const name of names) {
      if (!IDENTIFIER.test(name)) {
        throw new Error(`Invalid table name: ${JSON.stringify(name)}`);
      }
      const info = await this.client.execute(`PRAGMA table_info("${name}")`);
      const rows = toObjects(info.columns, info.rows as unknown as unknown[][]);
      const columns: ColumnSummary[] = rows.map((o) => ({
        name: String(o.name),
        type: String(o.type),
        notnull: Number(o.notnull) === 1,
      }));
      out.push({ table: name, columns });
    }
    return out;
  }

  async runReadOnlySql(sqlRaw: string, maxRows = DEFAULT_MAX_ROWS): Promise<QueryResult> {
    const sql = assertReadOnly(sqlRaw);
    const res = await this.client.execute(sql);
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
    // The shared sample client is process-lifetime; only release a client we
    // opened for a user-registered source.
    if (this.client !== warehouse) {
      this.client.close();
    }
  }
}
