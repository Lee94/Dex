import type { Connector, Dialect } from './types';
import { SqliteConnector } from './connectors/sqlite';
import { PostgresConnector } from './connectors/postgres';

/**
 * Resolves the *active* warehouse connector from env.
 *
 *   WAREHOUSE_PROVIDER = `sqlite` | `postgres`  — selects explicitly.
 * If unset, Postgres is inferred when a connection is configured
 * (DATABASE_URL / PG_CONNECTION_STRING / PGHOST); otherwise the bundled SQLite
 * sample is the no-setup default.
 *
 * The connector is constructed lazily and cached, so reading the active dialect
 * (for tool descriptions / agent instructions) never opens a connection.
 */

const env = (k: string) => process.env[k]?.trim() || undefined;

export function getActiveProvider(): Dialect {
  const explicit = env('WAREHOUSE_PROVIDER')?.toLowerCase();
  if (explicit === 'postgres' || explicit === 'sqlite') return explicit;
  if (env('DATABASE_URL') || env('PG_CONNECTION_STRING') || env('PGHOST')) return 'postgres';
  return 'sqlite';
}

let cached: Connector | null = null;

export function getConnector(): Connector {
  if (cached) return cached;
  cached = getActiveProvider() === 'postgres' ? new PostgresConnector() : new SqliteConnector();
  return cached;
}

/** For tests/teardown: drop the cached connector (closing it first). */
export async function resetConnector(): Promise<void> {
  if (cached) {
    await cached.close();
    cached = null;
  }
}

/** A one-line dialect reminder injected into the agent's SQL guidance. */
export function dialectHint(): string {
  return getActiveProvider() === 'postgres'
    ? "This is PostgreSQL — use Postgres syntax: date_trunc('month', col) for month buckets, CURRENT_DATE - INTERVAL '30 days' for relative dates, ILIKE for case-insensitive matching, and double-quoted identifiers."
    : "This is SQLite — use SQLite syntax: strftime('%Y-%m', col) for month buckets, date('now','-30 days') for relative dates.";
}
