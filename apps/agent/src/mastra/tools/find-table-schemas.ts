import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConnectorById } from '../db/connector';
import { getAllColumnMetadata, getAllTableMetadata } from '../db/metadata';
import { enrichTableListing } from '../db/catalog';

const DEFAULT_MAX_TABLES = 5;

/** Hex's case-sensitive EXACT filter shape (kept for parity; SQLite is unqualified
 *  so the filters are accepted but only narrow by substring when present). */
const exactFilter = z
  .object({ mode: z.literal('EXACT'), exact: z.string().min(1) })
  .nullable()
  .optional();

/**
 * `FindTableSchemas` (Hex) — discover candidate warehouse tables by keyword/topic.
 * Returns a compact summary (name, description, column count + column names) so
 * the agent can triage; it then calls `ViewTables` for full verified schema before
 * writing SQL. Built over the same connector + curated catalog as ViewTables.
 */
export const findTableSchemasTool = createTool({
  id: 'FindTableSchemas',
  description:
    "Discover candidate tables in the user's data warehouse by keyword or topic. Returns a compact " +
    'summary (name, description, column count + column names) ranked by relevance to your query — use ' +
    'the names exactly as returned (warehouse casing). Use this to discover tables from keywords, ' +
    'business concepts, or rough table themes, or when the user asks what tables exist for a topic. ' +
    'Start conservatively: it returns 5 tables by default — only raise maxTables if you need more ' +
    'after reviewing the first results. Do NOT use this when you already know an exact table name ' +
    '(from the user, a guide, or prior output) — use ViewTables for verified schema in that case. ' +
    'Tables/columns carry curated catalog metadata when present (`description`, `endorsed`) — prefer ' +
    'endorsed, well-described data.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'A keyword/topic search query (business concept, domain, metric, or table theme) — not an exact table name.',
      ),
    databaseFilter: exactFilter.describe('Optional case-sensitive database filter.'),
    schemaFilter: exactFilter.describe('Optional case-sensitive schema filter.'),
    maxTables: z.number().int().nullable().optional().describe('Max tables to return (default 5).'),
    dataConnectionId: z
      .string()
      .nullable()
      .optional()
      .describe('Optional data connection id to search another registered connection.'),
  }),
  outputSchema: z.object({
    dialect: z.string(),
    query: z.string(),
    tables: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        endorsed: z.boolean().optional(),
        columnCount: z.number(),
        columns: z.array(z.string()),
      }),
    ),
  }),
  execute: async (input) => {
    const dsId = input.dataConnectionId?.trim() || 'builtin';
    const connector = await getConnectorById(dsId);
    const [tables, tableMeta, schema, columnMeta] = await Promise.all([
      connector.listTables(),
      getAllTableMetadata(dsId),
      connector.tableColumns(),
      getAllColumnMetadata(dsId),
    ]);
    // Reuse the catalog enrichment (drops AI-excluded tables/columns, attaches
    // descriptions + endorsed), then rank by keyword relevance.
    const enriched = enrichTableListing(tables, schema, tableMeta, columnMeta);
    const tokens = input.query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);

    const scored = enriched.map((t) => {
      const cols = t.columns ?? [];
      const haystack =
        `${t.name} ${t.description ?? ''} ${cols.map((c) => c.name).join(' ')}`.toLowerCase();
      let score = tokens.length === 0 ? 1 : 0;
      for (const tok of tokens) {
        if (t.name.toLowerCase().includes(tok)) score += 3;
        if ((t.description ?? '').toLowerCase().includes(tok)) score += 2;
        if (cols.some((c) => c.name.toLowerCase().includes(tok))) score += 1;
        else if (haystack.includes(tok)) score += 1;
      }
      if (t.endorsed) score += 0.5; // gentle tie-break toward vetted tables
      return { t, score };
    });

    const max = input.maxTables && input.maxTables > 0 ? input.maxTables : DEFAULT_MAX_TABLES;
    const picked = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(({ t }) => ({
        name: t.name,
        description: t.description,
        endorsed: t.endorsed,
        columnCount: (t.columns ?? []).length,
        columns: (t.columns ?? []).map((c) => c.name),
      }));

    return { dialect: connector.dialect, query: input.query, tables: picked };
  },
});
