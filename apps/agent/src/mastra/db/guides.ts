import { randomUUID } from 'node:crypto';
import { dexStore } from './store';

/**
 * Org guides (v0.9) — the agent's knowledge base.
 *
 * Hex's analyst reads org **guides**: metric definitions, terminology, approved
 * query/filter patterns. This module persists markdown guides in `dex.db` and is
 * read by the `read_guide` tool + authored from the Knowledge UI. The agent
 * consults relevant guides early and treats their definitions as the standard,
 * instead of re-deriving a number every time.
 */

export interface Guide {
  id: string;
  slug: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: number;
}

/** A lightweight guide entry for discovery (no full content). */
export interface GuideSummary {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  excerpt: string;
}

/** A URL/identifier-safe slug derived from a title. */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'guide';
}

function excerptOf(content: string): string {
  const text = content
    .replace(/[#>*_`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await dexStore.execute(
        `CREATE TABLE IF NOT EXISTS dex_guides (
           id         TEXT PRIMARY KEY,
           slug       TEXT NOT NULL UNIQUE,
           title      TEXT NOT NULL,
           content    TEXT NOT NULL,
           tags       TEXT,
           updated_at INTEGER
         )`,
      );
      await seedStarterGuide();
    })();
  }
  return schemaReady;
}

/**
 * Seed one starter guide on a fresh DB so the agent has knowledge out of the box.
 * Inserts directly (not via createGuide) to avoid re-entering ensureSchema while
 * it is still resolving.
 */
async function seedStarterGuide(): Promise<void> {
  const count = await dexStore.execute('SELECT COUNT(*) AS n FROM dex_guides');
  if (Number((count.rows[0] as Record<string, unknown>)?.n ?? 0) > 0) return;
  const content = `# Revenue & order definitions

These are the standard definitions for the sample e-commerce warehouse. Prefer the
governed **semantic metrics** over re-deriving these by hand.

- **Revenue** — \`SUM(order_items.quantity * order_items.unit_price)\`. Use the
  semantic metric \`revenue\`.
- **Completed revenue** — revenue restricted to \`orders.status = 'completed'\`.
  Use the semantic metric \`completed_revenue\`. This is the default "revenue"
  number for finance-facing answers; pending/cancelled orders are excluded.
- **Order grain** — one row per order in \`orders\`; line items live in
  \`order_items\` (one row per product per order). Join on
  \`order_items.order_id = orders.id\` and aggregate to avoid double-counting.
- **Active customer** — a customer with at least one \`completed\` order in the
  period in question.`;
  await dexStore.execute({
    sql: `INSERT INTO dex_guides (id, slug, title, content, tags, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      'revenue-definitions',
      'Revenue & order definitions',
      content,
      JSON.stringify(['definitions', 'revenue']),
      Date.now(),
    ],
  });
}

type Cell = unknown;

function rowToGuide(row: Record<string, Cell>): Guide {
  let tags: string[] = [];
  if (row.tags != null) {
    try {
      const parsed = JSON.parse(String(row.tags));
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch {
      /* tolerate legacy values */
    }
  }
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    content: String(row.content),
    tags,
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export async function listGuides(): Promise<GuideSummary[]> {
  await ensureSchema();
  const res = await dexStore.execute('SELECT * FROM dex_guides ORDER BY title ASC');
  return (res.rows as unknown as Record<string, Cell>[]).map((row) => {
    const g = rowToGuide(row);
    return { id: g.id, slug: g.slug, title: g.title, tags: g.tags, excerpt: excerptOf(g.content) };
  });
}

/** Fetch a guide by id or slug (so the agent can ask for either). */
export async function getGuide(idOrSlug: string): Promise<Guide | null> {
  await ensureSchema();
  const res = await dexStore.execute({
    sql: 'SELECT * FROM dex_guides WHERE id = ? OR slug = ? LIMIT 1',
    args: [idOrSlug, idOrSlug],
  });
  if (res.rows.length === 0) return null;
  return rowToGuide(res.rows[0] as unknown as Record<string, Cell>);
}

/** Ensure a slug is unique by appending -2, -3, … on collision. */
async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (await getGuide(slug)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export async function createGuide(input: {
  title: string;
  content: string;
  tags?: string[];
}): Promise<Guide> {
  await ensureSchema();
  const title = input.title.trim();
  if (!title) throw new Error('A guide title is required.');
  const guide: Guide = {
    id: randomUUID(),
    slug: await uniqueSlug(slugify(title)),
    title,
    content: input.content ?? '',
    tags: input.tags ?? [],
    updatedAt: Date.now(),
  };
  await dexStore.execute({
    sql: `INSERT INTO dex_guides (id, slug, title, content, tags, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      guide.id,
      guide.slug,
      guide.title,
      guide.content,
      JSON.stringify(guide.tags),
      guide.updatedAt,
    ],
  });
  return guide;
}

export async function updateGuide(
  id: string,
  patch: { title?: string; content?: string; tags?: string[] },
): Promise<Guide | null> {
  await ensureSchema();
  const current = await getGuide(id);
  if (!current) return null;
  const merged: Guide = {
    ...current,
    title: patch.title?.trim() || current.title,
    content: patch.content ?? current.content,
    tags: patch.tags ?? current.tags,
    updatedAt: Date.now(),
  };
  await dexStore.execute({
    sql: `UPDATE dex_guides SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?`,
    args: [merged.title, merged.content, JSON.stringify(merged.tags), merged.updatedAt, id],
  });
  return merged;
}

export async function deleteGuide(id: string): Promise<boolean> {
  await ensureSchema();
  const current = await getGuide(id);
  if (!current) return false;
  await dexStore.execute({ sql: 'DELETE FROM dex_guides WHERE id = ?', args: [id] });
  return true;
}
