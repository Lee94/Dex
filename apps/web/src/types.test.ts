import { describe, expect, it } from 'vitest';
import { isSqlResult, outputNameOf, toCsv, toNum, vizCellsOf, type SqlResult } from '@/types';

const result = (columns: string[], rows: Array<Record<string, unknown>>): SqlResult => ({
  columns,
  rows,
  rowCount: rows.length,
  truncated: false,
});

describe('isSqlResult', () => {
  it('accepts a result with columns + rows arrays', () => {
    expect(isSqlResult(result(['a'], [{ a: 1 }]))).toBe(true);
  });
  it('rejects non-results', () => {
    expect(isSqlResult(null)).toBe(false);
    expect(isSqlResult({ foo: 1 })).toBe(false);
    expect(isSqlResult({ columns: 'x', rows: [] })).toBe(false);
  });
});

describe('outputNameOf', () => {
  it('reads a SQL cell result outputName, ignores the rest', () => {
    expect(outputNameOf({ outputName: 'top_sales', columns: [], rows: [] })).toBe('top_sales');
    expect(outputNameOf({ columns: [], rows: [] })).toBeUndefined();
    expect(outputNameOf({ outputName: '' })).toBeUndefined();
    expect(outputNameOf(null)).toBeUndefined();
  });
});

describe('vizCellsOf', () => {
  it('lifts viz cells from a DelegateToVisualizationAgent result', () => {
    const dsl = { dslVersion: 1, geoms: [{ type: 'line' }] };
    const res = {
      summary: 'Created [cell:abc] — a line chart',
      vizCells: [{ cellId: 'abc', sourceOutputName: 'trend', dsl, label: 'Trend' }],
    };
    expect(vizCellsOf(res)).toEqual([
      { cellId: 'abc', sourceOutputName: 'trend', dsl, label: 'Trend' },
    ]);
  });
  it('returns [] when there are no viz cells / wrong shape', () => {
    expect(vizCellsOf({ summary: 'no chart' })).toEqual([]);
    expect(vizCellsOf({ vizCells: [{ noId: true }] })).toEqual([]);
    expect(vizCellsOf(null)).toEqual([]);
    expect(vizCellsOf({ rows: [], columns: [] })).toEqual([]);
  });
});

describe('toNum', () => {
  it('coerces numbers and numeric strings, rejects the rest', () => {
    expect(toNum(42)).toBe(42);
    expect(toNum('42.5')).toBe(42.5);
    expect(toNum('abc')).toBeNull();
    expect(toNum(null)).toBeNull();
    expect(toNum(NaN)).toBeNull();
  });
});

describe('toCsv', () => {
  it('serializes with RFC-4180 quoting', () => {
    const r = result(
      ['name', 'note'],
      [
        { name: 'Alice', note: 'plain' },
        { name: 'Bob', note: 'has, comma' },
        { name: 'Cara', note: 'has "quote"' },
      ],
    );
    expect(toCsv(r)).toBe(
      ['name,note', 'Alice,plain', 'Bob,"has, comma"', 'Cara,"has ""quote"""'].join('\n'),
    );
  });
});
