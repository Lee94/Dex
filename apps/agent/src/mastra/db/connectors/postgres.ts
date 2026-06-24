import { Pool } from 'pg';
import type { PoolClient } from 'pg';
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
 * A live Postgres warehouse connector (v0.3).
 *
 * Defense in depth, layered on top of the universal `assertReadOnly` guard:
 *   1. Every query runs inside a `START TRANSACTION READ ONLY` — Postgres itself
 *      rejects any write that slips past the guard.
 *   2. A per-statement `statement_timeout` bounds runaway/expensive queries.
 *   3. Rows returned to the model are capped (`maxRows`).
 * For real deployments, also connect with a least-privileged **read-only role**
 * (only SELECT grants) — configure that on the database/connection string; the
 * connector never needs write access.
 *
 * Connection config (never commit credentials — set these in `.env`):
 *   DATABASE_URL / PG_CONNECTION_STRING  — a full connection string, or
 *   PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD  — discrete vars (pg reads
 *   these automatically).
 *   PGSCHEMA            — schema to introspect (default "public").
 *   PGSSL=require       — enable TLS (rejectUnauthorized:false for self-signed).
 *   WAREHOUSE_STATEMENT_TIMEOUT_MS — per-query timeout (default 5000).
 */

const env = (k: string) => process.env[k]?.trim() || undefined;

function statementTimeoutMs(): number {
  const raw = Number(env('WAREHOUSE_STATEMENT_TIMEOUT_MS'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
}

function quoteIdent(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

/** Explicit connection config for a user-registered Postgres source (v0.6). */
export interface PgConnectorOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  schema?: string;
  ssl?: boolean;
}

export class PostgresConnector implements Connector {
  readonly dialect = 'postgres' as const;
  readonly label: string;
  private pool: Pool;
  private schema: string;

  /** No arg → read connection from env (the agent's active source). `opts` →
   *  an explicitly-configured source registered through the data-source UI. */
  constructor(opts?: PgConnectorOptions) {
    if (opts) {
      const ssl = opts.ssl ? { rejectUnauthorized: false } : undefined;
      this.pool = new Pool({
        connectionString: opts.connectionString,
        host: opts.host,
        port: opts.port,
        database: opts.database,
        user: opts.user,
        password: opts.password,
        ssl,
        connectionTimeoutMillis: 8000,
        max: 4,
      });
      this.schema = opts.schema || 'public';
      const where = opts.connectionString
        ? opts.connectionString.replace(/:[^:@/]*@/, ':****@')
        : (opts.host ?? 'config');
      this.label = `Postgres ${opts.database ?? ''} (${where}, schema ${this.schema})`;
    } else {
      const connectionString = env('DATABASE_URL') ?? env('PG_CONNECTION_STRING');
      const ssl = env('PGSSL') === 'require' ? { rejectUnauthorized: false } : undefined;
      this.pool = new Pool({
        connectionString,
        ssl,
        // Bound how long we'll wait to even get a connection.
        connectionTimeoutMillis: 8000,
        max: 4,
      });
      this.schema = env('PGSCHEMA') || 'public';
      const where = connectionString
        ? connectionString.replace(/:[^:@/]*@/, ':****@')
        : env('PGHOST');
      this.label = `Postgres ${env('PGDATABASE') ?? ''} (${where ?? 'env'}, schema ${this.schema})`;
    }
  }

  /** Run `fn` inside a read-only transaction with a bounded statement timeout. */
  private async withReadOnly<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('START TRANSACTION READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${statementTimeoutMs()}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* connection may be broken; releasing with an error discards it */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async listTables(): Promise<TableInfo[]> {
    return this.withReadOnly(async (client) => {
      const tablesRes = await client.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'
          ORDER BY table_name`,
        [this.schema],
      );

      const tables: TableInfo[] = [];
      for (const { table_name } of tablesRes.rows) {
        const qualified = `${quoteIdent(this.schema)}.${quoteIdent(table_name)}`;
        const countRes = await client.query<{ n: string }>(
          `SELECT COUNT(*) AS n FROM ${qualified}`,
        );
        tables.push({ name: table_name, rowCount: Number(countRes.rows[0]?.n ?? 0) });
      }
      return tables;
    });
  }

  async describeTable(table: string): Promise<TableDescription> {
    if (!IDENTIFIER.test(table)) {
      throw new Error(`Invalid table name: ${JSON.stringify(table)}`);
    }
    return this.withReadOnly(async (client) => {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [this.schema, table],
      );
      if (exists.rowCount === 0) {
        throw new Error(`Table not found: ${table}`);
      }

      const colsRes = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [this.schema, table],
      );

      const pkRes = await client.query<{ column_name: string }>(
        `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
            AND kcu.table_schema = tc.table_schema
          WHERE tc.table_schema = $1 AND tc.table_name = $2
            AND tc.constraint_type = 'PRIMARY KEY'`,
        [this.schema, table],
      );
      const pkCols = new Set(pkRes.rows.map((r) => r.column_name));

      const columns: ColumnInfo[] = colsRes.rows.map((c) => ({
        name: c.column_name,
        type: c.data_type,
        notnull: c.is_nullable === 'NO',
        primaryKey: pkCols.has(c.column_name),
      }));

      const qualified = `${quoteIdent(this.schema)}.${quoteIdent(table)}`;
      const sampleRes = await client.query(`SELECT * FROM ${qualified} LIMIT 5`);
      const sampleRows = sampleRes.rows as Row[];

      return { table, columns, sampleRows };
    });
  }

  async runReadOnlySql(sqlRaw: string, maxRows = DEFAULT_MAX_ROWS): Promise<QueryResult> {
    const sql = assertReadOnly(sqlRaw);
    return this.withReadOnly(async (client) => {
      const res = await client.query(sql);
      const columns = res.fields.map((f) => f.name);
      const allRows = res.rows as Row[];
      const rows = allRows.slice(0, maxRows);
      return {
        columns,
        rows,
        rowCount: allRows.length,
        truncated: allRows.length > maxRows,
      };
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
