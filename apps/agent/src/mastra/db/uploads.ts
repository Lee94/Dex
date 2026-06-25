import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Uploaded files (v1.1) — small user uploads the agent can read as context.
 *
 * Files are stored (base64) in `dex.db` with a hard size cap; the agent reads
 * them by id via `get_file_contents`. Text/markdown/JSON come back as text; a CSV
 * is additionally parsed into a column/row preview + quick stats; images and
 * other binaries return metadata only (no kernel/vision here — that's later).
 * Uploaded content is **untrusted reference material**, like web content.
 */

/** Hard cap on a single upload (decoded bytes). Keeps dex.db small. */
export const MAX_UPLOAD_BYTES = 1_000_000;

export interface UploadMeta {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  createdAt: number;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dexStore
      .execute(
        `CREATE TABLE IF NOT EXISTS dex_uploads (
           id         TEXT PRIMARY KEY,
           filename   TEXT NOT NULL,
           mimetype   TEXT NOT NULL,
           size       INTEGER NOT NULL,
           content_b64 TEXT NOT NULL,
           created_at INTEGER
         )`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

type Cell = unknown;

function rowToMeta(row: Record<string, Cell>): UploadMeta {
  return {
    id: String(row.id),
    filename: String(row.filename),
    mimetype: String(row.mimetype),
    size: Number(row.size ?? 0),
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function saveUpload(input: {
  filename: string;
  mimetype: string;
  contentBase64: string;
}): Promise<UploadMeta> {
  await ensureSchema();
  const buf = Buffer.from(input.contentBase64, 'base64');
  if (buf.byteLength === 0) throw new Error('Empty upload.');
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (${buf.byteLength} bytes; max ${MAX_UPLOAD_BYTES}).`);
  }
  const meta: UploadMeta = {
    id: randomUUID(),
    filename: input.filename.trim() || 'upload',
    mimetype: input.mimetype.trim() || 'application/octet-stream',
    size: buf.byteLength,
    createdAt: Date.now(),
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_uploads (id, filename, mimetype, size, content_b64, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      meta.id,
      meta.filename,
      meta.mimetype,
      meta.size,
      buf.toString('base64'),
      meta.createdAt,
    ],
  });
  return meta;
}

export async function listUploads(): Promise<UploadMeta[]> {
  await ensureSchema();
  const res = await dexStore.execute(
    'SELECT id, filename, mimetype, size, created_at FROM dex_uploads ORDER BY created_at DESC',
  );
  return (res.rows as unknown as Record<string, Cell>[]).map(rowToMeta);
}

export async function getUpload(id: string): Promise<(UploadMeta & { content: Buffer }) | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_uploads WHERE id = ?',
    args: [id],
  });
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as unknown as Record<string, Cell>;
  return { ...rowToMeta(row), content: Buffer.from(String(row.content_b64), 'base64') };
}

export async function deleteUpload(id: string): Promise<boolean> {
  await ensureSchema();
  const existing = await dexStore.execute({
    sql: 'SELECT id FROM dex_uploads WHERE id = ?',
    args: [id],
  });
  if (existing.rows.length === 0) return false;
  await dexStore.execute({ sql: 'DELETE FROM dex_uploads WHERE id = ?', args: [id] });
  return true;
}

// --- reading ---------------------------------------------------------------

function isTextual(filename: string, mimetype: string): boolean {
  if (mimetype.startsWith('text/')) return true;
  if (/^(application\/(json|csv|xml)|application\/x-ndjson)$/.test(mimetype)) return true;
  return /\.(csv|tsv|txt|md|json|log|xml|yaml|yml)$/i.test(filename);
}

function isCsv(filename: string, mimetype: string): boolean {
  return /csv$/i.test(mimetype) || /\.csv$/i.test(filename);
}

/** Minimal RFC-4180-ish CSV parser (quotes, embedded commas/newlines). */
export function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
  const columns = nonEmpty[0] ?? [];
  return { columns, rows: nonEmpty.slice(1) };
}

export type FileContents =
  | {
      kind: 'text';
      filename: string;
      mimetype: string;
      size: number;
      untrusted: true;
      content: string;
      truncated: boolean;
    }
  | {
      kind: 'csv';
      filename: string;
      mimetype: string;
      size: number;
      untrusted: true;
      columns: string[];
      rowCount: number;
      sampleRows: Record<string, string>[];
    }
  | {
      kind: 'binary';
      filename: string;
      mimetype: string;
      size: number;
      untrusted: true;
      note: string;
    };

const MAX_TEXT_CHARS = 12000;
const CSV_SAMPLE_ROWS = 20;

/** Read an upload's contents for the agent (text / CSV preview / binary note). */
export async function readFileContents(id: string): Promise<FileContents | null> {
  const file = await getUpload(id);
  if (!file) return null;
  const base = {
    filename: file.filename,
    mimetype: file.mimetype,
    size: file.size,
    untrusted: true as const,
  };

  if (isCsv(file.filename, file.mimetype)) {
    const { columns, rows } = parseCsv(file.content.toString('utf8'));
    const sampleRows = rows.slice(0, CSV_SAMPLE_ROWS).map((r) => {
      const obj: Record<string, string> = {};
      columns.forEach((col, i) => {
        obj[col] = r[i] ?? '';
      });
      return obj;
    });
    return { kind: 'csv', ...base, columns, rowCount: rows.length, sampleRows };
  }

  if (isTextual(file.filename, file.mimetype)) {
    const text = file.content.toString('utf8');
    const truncated = text.length > MAX_TEXT_CHARS;
    return {
      kind: 'text',
      ...base,
      content: truncated ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text,
      truncated,
    };
  }

  return {
    kind: 'binary',
    ...base,
    note: file.mimetype.startsWith('image/')
      ? 'Image file — stored as context; its pixels are not readable here (no vision/kernel yet).'
      : 'Binary file — not readable as text.',
  };
}
