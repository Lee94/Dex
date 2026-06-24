import { dexStore } from './store';

/**
 * Catalog metadata overlay (v0.6).
 *
 * Introspection (`Connector.describeTable`) gives the *structural* truth — table
 * names, columns, types, primary keys. This module stores the *curated* overlay
 * on top: human descriptions, a status (e.g. "endorsed"), categories, and the
 * "Included for AI" flag. They are keyed by `(datasource_id, table[, column])`
 * so the overlay survives schema changes and is merged in at read time.
 *
 * NOTE: `includedForAi` is persisted and surfaced in the UI, but does not yet
 * gate what the agent sees — the agent's dialect/instructions are fixed at boot
 * (see the plan's constraints). Honoring it in the agent catalog is deferred.
 */

export interface Metadata {
  description: string | null;
  status: string | null;
  categories: string[];
  includedForAi: boolean;
}

export type MetadataPatch = Partial<Metadata>;

const DEFAULT_META: Metadata = {
  description: null,
  status: null,
  categories: [],
  includedForAi: true,
};

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = Promise.all([
      dexStore.execute(
        `CREATE TABLE IF NOT EXISTS dex_table_metadata (
           datasource_id   TEXT NOT NULL,
           table_name      TEXT NOT NULL,
           description     TEXT,
           status          TEXT,
           categories      TEXT,
           included_for_ai INTEGER DEFAULT 1,
           updated_at      INTEGER,
           PRIMARY KEY (datasource_id, table_name)
         )`,
      ),
      dexStore.execute(
        `CREATE TABLE IF NOT EXISTS dex_column_metadata (
           datasource_id   TEXT NOT NULL,
           table_name      TEXT NOT NULL,
           column_name     TEXT NOT NULL,
           description     TEXT,
           status          TEXT,
           categories      TEXT,
           included_for_ai INTEGER DEFAULT 1,
           updated_at      INTEGER,
           PRIMARY KEY (datasource_id, table_name, column_name)
         )`,
      ),
    ]).then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function rowToMetadata(row: Record<string, Cell> | undefined): Metadata {
  if (!row) return { ...DEFAULT_META };
  let categories: string[] = [];
  if (row.categories != null) {
    try {
      const parsed = JSON.parse(String(row.categories));
      if (Array.isArray(parsed)) categories = parsed.map(String);
    } catch {
      /* tolerate legacy/non-JSON values */
    }
  }
  return {
    description: row.description == null ? null : String(row.description),
    status: row.status == null ? null : String(row.status),
    categories,
    includedForAi: row.included_for_ai == null ? true : Number(row.included_for_ai) === 1,
  };
}

// --- table-level ------------------------------------------------------------

export async function getTableMetadata(datasourceId: string, table: string): Promise<Metadata> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_table_metadata WHERE datasource_id = ? AND table_name = ?',
    args: [datasourceId, table],
  });
  return rowToMetadata(res.rows[0] as unknown as Record<string, Cell> | undefined);
}

/** All table-level metadata for a datasource, keyed by table name. */
export async function getAllTableMetadata(datasourceId: string): Promise<Record<string, Metadata>> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_table_metadata WHERE datasource_id = ?',
    args: [datasourceId],
  });
  const map: Record<string, Metadata> = {};
  for (const row of res.rows as unknown as Record<string, Cell>[]) {
    map[String(row.table_name)] = rowToMetadata(row);
  }
  return map;
}

export async function upsertTableMetadata(
  datasourceId: string,
  table: string,
  patch: MetadataPatch,
): Promise<Metadata> {
  const current = await getTableMetadata(datasourceId, table);
  const merged: Metadata = { ...current, ...patch };
  await dexStore.execute({
    sql: `INSERT INTO dex_table_metadata
            (datasource_id, table_name, description, status, categories, included_for_ai, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(datasource_id, table_name) DO UPDATE SET
            description = excluded.description,
            status = excluded.status,
            categories = excluded.categories,
            included_for_ai = excluded.included_for_ai,
            updated_at = excluded.updated_at`,
    args: [
      datasourceId,
      table,
      merged.description,
      merged.status,
      JSON.stringify(merged.categories),
      merged.includedForAi ? 1 : 0,
      Date.now(),
    ],
  });
  return merged;
}

// --- column-level -----------------------------------------------------------

/** All column metadata for a table, keyed by column name (missing = defaults). */
export async function getColumnMetadataMap(
  datasourceId: string,
  table: string,
): Promise<Record<string, Metadata>> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_column_metadata WHERE datasource_id = ? AND table_name = ?',
    args: [datasourceId, table],
  });
  const map: Record<string, Metadata> = {};
  for (const row of res.rows as unknown as Record<string, Cell>[]) {
    map[String(row.column_name)] = rowToMetadata(row);
  }
  return map;
}

export async function upsertColumnMetadata(
  datasourceId: string,
  table: string,
  column: string,
  patch: MetadataPatch,
): Promise<Metadata> {
  const map = await getColumnMetadataMap(datasourceId, table);
  const current = map[column] ?? { ...DEFAULT_META };
  const merged: Metadata = { ...current, ...patch };
  await dexStore.execute({
    sql: `INSERT INTO dex_column_metadata
            (datasource_id, table_name, column_name, description, status, categories, included_for_ai, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(datasource_id, table_name, column_name) DO UPDATE SET
            description = excluded.description,
            status = excluded.status,
            categories = excluded.categories,
            included_for_ai = excluded.included_for_ai,
            updated_at = excluded.updated_at`,
    args: [
      datasourceId,
      table,
      column,
      merged.description,
      merged.status,
      JSON.stringify(merged.categories),
      merged.includedForAi ? 1 : 0,
      Date.now(),
    ],
  });
  return merged;
}

/** Remove all metadata rows for a datasource (used by the smoke test cleanup). */
export async function deleteMetadataForDatasource(datasourceId: string): Promise<void> {
  await ensureSchema();
  await dexStore.execute({
    sql: 'DELETE FROM dex_table_metadata WHERE datasource_id = ?',
    args: [datasourceId],
  });
  await dexStore.execute({
    sql: 'DELETE FROM dex_column_metadata WHERE datasource_id = ?',
    args: [datasourceId],
  });
}
