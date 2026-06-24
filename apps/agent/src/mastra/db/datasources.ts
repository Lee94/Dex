import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dexStore } from './store';
import { WAREHOUSE_PATH } from './warehouse';
import type { Dialect } from './types';

/**
 * Data-source registry (v0.6).
 *
 * The agent has always resolved a single *active* connector from env
 * (`connector.ts`). This module lets the UI register and persist **additional**
 * read-only sources to browse, without touching that env-driven default. The
 * env source is surfaced as a synthetic `builtin` entry (see
 * `getBuiltinDataSource` in `connector.ts`); only user-added sources live here.
 *
 * Credentials are never stored in the database. Non-sensitive connection params
 * (host/port/database/schema/user/filePath) go in `dex_datasources`; the
 * password / full connection string lives in a gitignored
 * `datasources.local.json` next to the DB, and the row only keeps a
 * `credentialRef`. API responses never echo the secret back.
 */

export type DataSourceType = Dialect; // 'sqlite' | 'postgres'

export interface DataSourceConfig {
  id: string;
  name: string;
  type: DataSourceType;
  // Non-sensitive connection params (safe to persist).
  host?: string;
  port?: number;
  database?: string;
  schema?: string; // postgres introspection schema (default "public")
  ssl?: boolean;
  user?: string;
  filePath?: string; // sqlite file path
  // Reference to the secret in datasources.local.json (never the secret itself).
  credentialRef?: string;
  createdAt: number;
}

/** Shape returned to the client — guaranteed free of credentials. */
export interface PublicDataSource {
  id: string;
  name: string;
  type: DataSourceType;
  dialect: Dialect;
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  user?: string;
  /** A masked, human-readable target, e.g. "db.example.com:5432/analytics". */
  target: string;
  isBuiltin: boolean;
  isAgentSource: boolean;
  createdAt: number;
}

// --- secrets (gitignored, never in the DB) ----------------------------------

export interface DataSourceSecret {
  password?: string;
  connectionString?: string;
}

const SECRETS_PATH = path.join(path.dirname(WAREHOUSE_PATH), 'datasources.local.json');

let secretsCache: Record<string, DataSourceSecret> | null = null;

function loadSecrets(): Record<string, DataSourceSecret> {
  if (secretsCache) return secretsCache;
  try {
    secretsCache = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8')) as Record<
      string,
      DataSourceSecret
    >;
  } catch {
    secretsCache = {};
  }
  return secretsCache;
}

function persistSecrets(): void {
  const data = secretsCache ?? {};
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function getSecret(id: string): DataSourceSecret | undefined {
  return loadSecrets()[id];
}

export function setSecret(id: string, secret: DataSourceSecret): void {
  const all = loadSecrets();
  all[id] = secret;
  persistSecrets();
}

export function deleteSecret(id: string): void {
  const all = loadSecrets();
  if (id in all) {
    delete all[id];
    persistSecrets();
  }
}

// --- schema -----------------------------------------------------------------

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_datasources (
           id            TEXT PRIMARY KEY,
           name          TEXT NOT NULL,
           type          TEXT NOT NULL,
           host          TEXT,
           port          INTEGER,
           "database"    TEXT,
           "schema"      TEXT,
           ssl           INTEGER,
           "user"        TEXT,
           file_path     TEXT,
           credential_ref TEXT,
           created_at    INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

// --- row mapping ------------------------------------------------------------

type Cell = unknown;

function rowToConfig(row: Record<string, Cell>): DataSourceConfig {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type) as DataSourceType,
    host: row.host == null ? undefined : String(row.host),
    port: row.port == null ? undefined : Number(row.port),
    database: row.database == null ? undefined : String(row.database),
    schema: row.schema == null ? undefined : String(row.schema),
    ssl: row.ssl == null ? undefined : Number(row.ssl) === 1,
    user: row.user == null ? undefined : String(row.user),
    filePath: row.file_path == null ? undefined : String(row.file_path),
    credentialRef: row.credential_ref == null ? undefined : String(row.credential_ref),
    createdAt: Number(row.created_at ?? 0),
  };
}

// --- CRUD -------------------------------------------------------------------

export async function loadAllConfigs(): Promise<DataSourceConfig[]> {
  await ensureSchema();
  const res = await dexStore.execute('SELECT * FROM dex_datasources ORDER BY created_at ASC');
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToConfig);
}

export async function loadConfig(id: string): Promise<DataSourceConfig | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_datasources WHERE id = ?',
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return rowToConfig(res.rows[0] as unknown as Record<string, Cell>);
}

export interface NewDataSourceInput {
  name: string;
  type: DataSourceType;
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  ssl?: boolean;
  user?: string;
  filePath?: string;
  // Secrets — stored outside the DB.
  password?: string;
  connectionString?: string;
}

export async function saveConfig(input: NewDataSourceInput): Promise<DataSourceConfig> {
  await ensureSchema();
  const id = randomUUID();
  const hasSecret = !!(input.password || input.connectionString);
  if (hasSecret) {
    setSecret(id, { password: input.password, connectionString: input.connectionString });
  }
  const config: DataSourceConfig = {
    id,
    name: input.name,
    type: input.type,
    host: input.host,
    port: input.port,
    database: input.database,
    schema: input.schema,
    ssl: input.ssl,
    user: input.user,
    filePath: input.filePath,
    credentialRef: hasSecret ? `local:${id}` : undefined,
    createdAt: Date.now(),
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_datasources
            (id, name, type, host, port, "database", "schema", ssl, "user", file_path, credential_ref, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      config.id,
      config.name,
      config.type,
      config.host ?? null,
      config.port ?? null,
      config.database ?? null,
      config.schema ?? null,
      config.ssl == null ? null : config.ssl ? 1 : 0,
      config.user ?? null,
      config.filePath ?? null,
      config.credentialRef ?? null,
      config.createdAt,
    ],
  });
  return config;
}

export async function deleteConfig(id: string): Promise<void> {
  await ensureSchema();
  await dexStore.execute({ sql: 'DELETE FROM dex_datasources WHERE id = ?', args: [id] });
  deleteSecret(id);
}

// --- public projection ------------------------------------------------------

/** Mask a stored config into the credential-free shape sent to clients. */
export function toPublicDataSource(config: DataSourceConfig): PublicDataSource {
  const target =
    config.type === 'sqlite'
      ? (config.filePath ?? 'sqlite')
      : `${config.host ?? 'env'}${config.port ? `:${config.port}` : ''}${
          config.database ? `/${config.database}` : ''
        }`;
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    dialect: config.type,
    host: config.host,
    port: config.port,
    database: config.database,
    schema: config.schema,
    user: config.user,
    target,
    isBuiltin: false,
    isAgentSource: false,
    createdAt: config.createdAt,
  };
}
