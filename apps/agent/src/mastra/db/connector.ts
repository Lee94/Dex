import type { Connector, Dialect } from './types';
import { SqliteConnector } from './connectors/sqlite';
import { PostgresConnector } from './connectors/postgres';
import {
  loadConfig,
  getSecret,
  type DataSourceConfig,
  type DataSourceSecret,
  type PublicDataSource,
} from './datasources';

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

// ---------------------------------------------------------------------------
// Multi-source registry (v0.6)
//
// The env-driven `getConnector()` above is unchanged — it stays the single
// source the *agent* queries. The registry below lets the data-source UI open
// and browse *additional* read-only connectors at runtime, keyed by id, without
// affecting the agent's active source.
// ---------------------------------------------------------------------------

const pool = new Map<string, Connector>();

/** Build a connector from a stored config + its (out-of-band) secret. */
export function createConnectorFromConfig(
  config: DataSourceConfig,
  secret?: DataSourceSecret,
): Connector {
  if (config.type === 'postgres') {
    return new PostgresConnector({
      connectionString: secret?.connectionString,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: secret?.password,
      schema: config.schema,
      ssl: config.ssl,
    });
  }
  return new SqliteConnector(config.filePath);
}

/**
 * Resolve a connector by data-source id. `"builtin"` returns the env-driven
 * active connector; any other id is looked up in the registry and cached.
 */
export async function getConnectorById(id: string): Promise<Connector> {
  if (id === 'builtin') return getConnector();
  const existing = pool.get(id);
  if (existing) return existing;
  const config = await loadConfig(id);
  if (!config) throw new Error(`Unknown data source: ${id}`);
  const connector = createConnectorFromConfig(config, getSecret(id));
  pool.set(id, connector);
  return connector;
}

/** Drop a registered connector from the cache (closing it first). */
export async function closeConnectorById(id: string): Promise<void> {
  const connector = pool.get(id);
  if (connector) {
    pool.delete(id);
    await connector.close();
  }
}

/** The env-configured active source, projected as a (synthetic) catalog entry. */
export function getBuiltinDataSource(): PublicDataSource {
  const provider = getActiveProvider();
  const connector = getConnector();
  return {
    id: 'builtin',
    name: connector.label,
    type: provider,
    dialect: provider,
    target: connector.label,
    isBuiltin: true,
    isAgentSource: true,
    createdAt: 0,
  };
}

/** A one-line dialect reminder injected into the agent's SQL guidance. */
export function dialectHint(): string {
  return getActiveProvider() === 'postgres'
    ? "This is PostgreSQL — use Postgres syntax: date_trunc('month', col) for month buckets, CURRENT_DATE - INTERVAL '30 days' for relative dates, ILIKE for case-insensitive matching, and double-quoted identifiers."
    : "This is SQLite — use SQLite syntax: strftime('%Y-%m', col) for month buckets, date('now','-30 days') for relative dates.";
}
