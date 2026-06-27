import path from 'node:path';
import { createClient } from '@libsql/client';
import { WAREHOUSE_PATH } from './warehouse';

/**
 * Dex's own persistence store (v0.6) — a dedicated SQLite file holding the
 * data-source registry (`db/datasources.ts`) and the catalog metadata overlay
 * (`db/metadata.ts`).
 *
 * It is deliberately **separate** from both the sample `warehouse.db` (the data
 * the agent queries, which `npm run seed` recreates) and Mastra's own
 * `mastra.db` (conversation/telemetry storage we don't want to add custom
 * tables to). We anchor it next to `warehouse.db` so the path resolves the same
 * way under `npm run smoke` (cwd = apps/agent) and `mastra dev` (cwd =
 * src/mastra/public) — `WAREHOUSE_PATH` is already resolved by `warehouse.ts`.
 * `DEX_DB` overrides the location. The file is gitignored (`*.db`).
 */
const dbPath = process.env.DEX_DB?.trim() || path.join(path.dirname(WAREHOUSE_PATH), 'dex.db');

export const dexStore = createClient({ url: `file:${dbPath}` });

// Every Dex store module (datasources / metadata / semantic / guides / memories
// / tasks / projects …) shares this one SQLite file, and in production the
// scheduler + request handlers write it concurrently. Set a busy timeout so a
// writer waits for the lock instead of failing fast with SQLITE_BUSY — most
// visible when `npm test` runs each test file in its own process against the
// same dex.db. libsql serializes statements on the file connection, so this
// applies before the first query each process issues.
void dexStore.execute('PRAGMA busy_timeout = 5000').catch(() => {});

export const DEX_DB_PATH = dbPath;
