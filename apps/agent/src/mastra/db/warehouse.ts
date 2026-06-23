import path from 'node:path';
import { createClient } from '@libsql/client';

/**
 * The sample "data warehouse" the analyst agent queries.
 *
 * It is a plain SQLite file (`warehouse.db`) created by `db/seed.ts`. We anchor
 * the path to the process cwd, which is the `apps/agent` project root for both
 * `npm run seed` and `mastra dev`, so the seed script and the running agent
 * always point at the same file.
 */
const dbPath = process.env.WAREHOUSE_DB ?? path.join(process.cwd(), 'warehouse.db');

export const warehouse = createClient({ url: `file:${dbPath}` });

export const WAREHOUSE_PATH = dbPath;
