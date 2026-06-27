// Synthesize a starter vinci surface DSL from a SQL result's columns, so a manually
// added viz cell renders a sensible default chart the user can then edit in the Designer.
// (Agent-created viz cells supply their own DSL; this is the no-DSL fallback.)
type Row = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/;

type ColKind = 'number' | 'date' | 'string';

function kindOf(column: string, rows: Row[]): ColKind {
  for (const row of rows) {
    const v = row[column];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') return 'number';
    if (v instanceof Date) return 'date';
    if (typeof v === 'string') {
      if (ISO_DATE.test(v)) return 'date';
      if (v.trim() !== '' && !Number.isNaN(Number(v))) return 'number';
    }
    return 'string';
  }
  return 'string';
}

const TYPE_ALIAS: Record<ColKind, string> = { number: 'number', date: 'date', string: 'string' };

/**
 * Build a basic column-chart SurfaceDoc: first non-numeric column → x (dimension),
 * first numeric column → y (summed measure). Returns null if the result can't be
 * charted (needs at least one dimension + one measure).
 */
export function starterSurfaceDoc(
  columns: string[],
  rows: Row[],
  name = 'Chart',
): Record<string, unknown> | null {
  const kinds = new Map(columns.map((c) => [c, kindOf(c, rows)] as const));
  const xCol = columns.find((c) => kinds.get(c) !== 'number') ?? columns[0];
  const yCol = columns.find((c) => kinds.get(c) === 'number');
  if (!xCol || !yCol || xCol === yCol) return null;

  const xKind = kinds.get(xCol) ?? 'string';
  // A date x reads best as a line; a category as bars.
  const geomType = xKind === 'date' ? 'line' : 'interval';

  return {
    dslVersion: '1',
    dataVersion: '10.10.0',
    name,
    fields: {
      [xCol]: { from: xCol, type: TYPE_ALIAS[xKind] },
      [yCol]: { from: yCol, type: 'number' },
    },
    encoding: { x: [`${xCol}:same`], y: [`${yCol}:sum`] },
    geoms: { [yCol]: { type: geomType } },
    settings: {},
    theme: {},
  };
}
