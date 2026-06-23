/**
 * Warehouse query façade.
 *
 * The real logic now lives in the connector layer (`connector.ts` +
 * `connectors/*`); this module keeps the original import surface the tools and
 * smoke test use, delegating each call to the *active* connector (SQLite sample
 * by default, Postgres when configured — see `connector.ts`). The read-only
 * guard runs inside every connector, before any SQL executes.
 */

import { getConnector } from './connector';
import type { QueryResult, TableDescription, TableInfo } from './types';

// Re-export the shared types + the guard so existing imports keep working.
export type { ColumnInfo, Connector, QueryResult, Row, TableDescription, TableInfo } from './types';
export { assertReadOnly, IDENTIFIER } from './guard';
export { getActiveProvider, getConnector, dialectHint } from './connector';

/** List user tables in the active warehouse along with their row counts. */
export function listTables(): Promise<TableInfo[]> {
  return getConnector().listTables();
}

/** Describe a single table: its columns plus a few sample rows. */
export function describeTable(table: string): Promise<TableDescription> {
  return getConnector().describeTable(table);
}

/** Run a validated read-only query and return columns + rows (capped). */
export function runReadOnlySql(sqlRaw: string, maxRows?: number): Promise<QueryResult> {
  return getConnector().runReadOnlySql(sqlRaw, maxRows);
}
