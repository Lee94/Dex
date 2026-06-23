/**
 * Shared warehouse types + the connector seam (v0.3).
 *
 * A `Connector` is the single interface the agent's tools talk to. Two
 * implementations sit behind it — the bundled SQLite sample (the no-setup
 * default) and a live Postgres connection — so the tools and the entire web UI
 * don't change when you point Dex at a real warehouse. The v0.4 semantic layer
 * and future warehouses plug into this same seam.
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

export type Row = Record<string, unknown>;

export type TableDescription = {
  table: string;
  columns: ColumnInfo[];
  sampleRows: Row[];
};

export type QueryResult = {
  columns: string[];
  rows: Row[];
  rowCount: number;
  truncated: boolean;
};

/** The kind of warehouse a connector talks to (also the SQL dialect). */
export type Dialect = 'sqlite' | 'postgres';

/** Default cap on rows returned to the model from a single query. */
export const DEFAULT_MAX_ROWS = 1000;

export interface Connector {
  /** Which warehouse/dialect this connector speaks. */
  readonly dialect: Dialect;
  /** Short human label for logs / display, e.g. "SQLite sample (warehouse.db)". */
  readonly label: string;
  /** List user tables with their row counts. */
  listTables(): Promise<TableInfo[]>;
  /** Describe one table: columns + a few sample rows. */
  describeTable(table: string): Promise<TableDescription>;
  /** Run a validated, read-only query and return capped columns + rows. */
  runReadOnlySql(sql: string, maxRows?: number): Promise<QueryResult>;
  /** Release any pooled connections (no-op for SQLite). */
  close(): Promise<void>;
}
