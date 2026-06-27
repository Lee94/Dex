// Build a vinci `table` snapshot from a SQL result's columns, so the compiled model's
// schema matches the upstream data exactly. Injected into a SurfaceDoc's `table` slot
// before `dslToSnapshot` (the DSL otherwise synthesizes a table from its `fields` map).
import { TABLE_FIELD_TYPES } from '@vinci/core';

type Row = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/;

/** Infer a vinci TABLE_FIELD_TYPE from the first non-null sample value in a column. */
function inferType(column: string, rows: Row[]): number {
  for (const row of rows) {
    const v = row[column];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') return TABLE_FIELD_TYPES.NUMBER;
    if (v instanceof Date) return TABLE_FIELD_TYPES.DATE;
    if (typeof v === 'string') {
      if (ISO_DATE.test(v)) return TABLE_FIELD_TYPES.DATE;
      if (v.trim() !== '' && !Number.isNaN(Number(v))) return TABLE_FIELD_TYPES.NUMBER;
      return TABLE_FIELD_TYPES.STRING;
    }
    return TABLE_FIELD_TYPES.STRING;
  }
  return TABLE_FIELD_TYPES.STRING;
}

/** A vinci table snapshot ({$modelType:"vinci/table", fields:[{name,type}], ...}). */
export function buildVinciTableSnapshot(columns: string[], rows: Row[], name = 'data') {
  return {
    $modelType: 'vinci/table',
    $modelId: 'dex-table',
    id: 'dex-table',
    name,
    fields: columns.map((c) => ({ name: c, type: inferType(c, rows) })),
    params: [],
    missParams: [],
  };
}
