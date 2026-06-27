import path from 'node:path';
import { createClient } from '@libsql/client';

/**
 * The sample "data warehouse" the analyst agent queries.
 *
 * It is a plain SQLite file (`warehouse.db`) created by `db/seed.ts`.
 *
 * Path resolution is the subtle part. `npm run seed` / `smoke` / `test` run with
 * cwd = `apps/agent`, but `mastra dev` bundles into `.mastra/output` and runs
 * with cwd = `src/mastra/public`. A cwd-relative default therefore puts the
 * seeded file and the file the running agent opens in **different** places — the
 * dev one ends up an empty, auto-created db, so every query fails with
 * "no such table". To keep every entry point pointed at one file, set an
 * absolute `WAREHOUSE_DB` in `.env`.
 *
 * `mastra dev` loads `.env` itself; the standalone scripts (seed/smoke/test) do
 * not, so we best-effort load it here too, before reading `WAREHOUSE_DB`. When
 * there is no `.env` at cwd (CI, or dev's own cwd) the load is a no-op/throw we
 * swallow — CI's seed + test share a cwd, so a cwd-relative fallback still agrees.
 */
try {
  // Node >=20.12. Reads `${cwd}/.env` and does NOT override already-set vars.
  process.loadEnvFile();
} catch {
  /* no .env at cwd — rely on the real environment (Mastra's load, or CI's vars) */
}

const dbPath = process.env.WAREHOUSE_DB?.trim() || path.join(process.cwd(), 'warehouse.db');

export const warehouse = createClient({ url: `file:${dbPath}` });

export const WAREHOUSE_PATH = dbPath;
