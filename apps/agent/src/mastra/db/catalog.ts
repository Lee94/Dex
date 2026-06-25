/**
 * Catalog enrichment (v0.8) — pure functions that fold the curated metadata
 * overlay (`db/metadata.ts`) into the agent's discovery output.
 *
 * Kept separate from the `list_tables` / `describe_table` tools (which do the
 * I/O — connector + metadata reads) so the merge/filter logic is pure and
 * unit-testable without a warehouse or the LLM. Two rules apply everywhere:
 *   - attach each table/column's `description` + `endorsed` (status === endorsed)
 *   - drop anything the catalog marks `includedForAi = false`
 */
import type { Metadata } from './metadata';
import { isEndorsed } from './metadata';
import type { ColumnInfo, TableColumns, TableDescription, TableInfo } from './types';

export type EnrichedColumn = {
  name: string;
  type: string;
  description?: string;
  endorsed?: boolean;
};

export type EnrichedTable = {
  name: string;
  rowCount: number;
  description?: string;
  endorsed?: boolean;
  columns?: EnrichedColumn[];
};

export type DescribedColumn = ColumnInfo & { description?: string; endorsed?: boolean };

export type DescribedTable = {
  table: string;
  description?: string;
  endorsed?: boolean;
  columns?: DescribedColumn[];
  sampleRows?: TableDescription['sampleRows'];
  error?: string;
};

type MetaMap = Record<string, Metadata>;
type ColumnMetaMap = Record<string, Record<string, Metadata>>;

const decorate = (m: Metadata | undefined): { description?: string; endorsed?: boolean } => ({
  description: m?.description ?? undefined,
  endorsed: isEndorsed(m) ? true : undefined,
});

/** Tables the agent is allowed to see (catalog hasn't excluded them from AI). */
export function visibleTables<T extends { name: string }>(tables: T[], tableMeta: MetaMap): T[] {
  return tables.filter((t) => tableMeta[t.name]?.includedForAi !== false);
}

/**
 * Build `list_tables`' enriched table array: drop AI-excluded tables/columns and
 * attach descriptions + endorsed flags. Pass `schema = null` for the large-
 * warehouse path that omits columns.
 */
export function enrichTableListing(
  tables: TableInfo[],
  schema: TableColumns[] | null,
  tableMeta: MetaMap,
  columnMeta: ColumnMetaMap,
): EnrichedTable[] {
  const byTable = new Map((schema ?? []).map((s) => [s.table, s.columns]));
  return visibleTables(tables, tableMeta).map((t) => {
    const base: EnrichedTable = { ...t, ...decorate(tableMeta[t.name]) };
    if (schema === null) return base;
    const cols = columnMeta[t.name] ?? {};
    base.columns = (byTable.get(t.name) ?? [])
      .filter((c) => cols[c.name]?.includedForAi !== false)
      .map((c) => ({ name: c.name, type: c.type, ...decorate(cols[c.name]) }));
    return base;
  });
}

/**
 * Build one `describe_table` entry: block an AI-excluded table outright, else
 * attach descriptions + endorsed and drop AI-excluded columns.
 */
export function enrichTableDescription(
  desc: TableDescription,
  tableMeta: Metadata,
  columnMeta: MetaMap,
): DescribedTable {
  if (tableMeta.includedForAi === false) {
    return { table: desc.table, error: 'Excluded from AI by the data catalog.' };
  }
  return {
    table: desc.table,
    ...decorate(tableMeta),
    columns: desc.columns
      .filter((c) => columnMeta[c.name]?.includedForAi !== false)
      .map((c) => ({ ...c, ...decorate(columnMeta[c.name]) })),
    sampleRows: desc.sampleRows,
  };
}
