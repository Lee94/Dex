import { describe, expect, it } from 'vitest';
import {
  classifyColumns,
  inferChartShape,
  isSqlResult,
  isTemporalValue,
  toCsv,
  toNum,
  type SqlResult,
} from '@/types';

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

describe('toNum', () => {
  it('coerces numbers and numeric strings, rejects the rest', () => {
    expect(toNum(42)).toBe(42);
    expect(toNum('42.5')).toBe(42.5);
    expect(toNum('abc')).toBeNull();
    expect(toNum(null)).toBeNull();
    expect(toNum(NaN)).toBeNull();
  });
});

describe('isTemporalValue', () => {
  it('detects date / month / timestamp strings', () => {
    expect(isTemporalValue('2024-01')).toBe(true);
    expect(isTemporalValue('2024-01-31')).toBe(true);
    expect(isTemporalValue('2024-01-31 12:00')).toBe(true);
    expect(isTemporalValue('Electronics')).toBe(false);
    expect(isTemporalValue('2024')).toBe(false);
  });
});

describe('classifyColumns', () => {
  it('labels temporal / numeric / categorical columns', () => {
    const r = result(
      ['month', 'revenue', 'category'],
      [
        { month: '2024-01', revenue: 100, category: 'A' },
        { month: '2024-02', revenue: 200, category: 'B' },
      ],
    );
    expect(classifyColumns(r)).toEqual(['temporal', 'numeric', 'categorical']);
  });
});

describe('inferChartShape', () => {
  it('defaults a temporal+numeric result to a line chart', () => {
    const r = result(
      ['month', 'revenue'],
      [
        { month: '2024-01', revenue: 100 },
        { month: '2024-02', revenue: 200 },
      ],
    );
    const shape = inferChartShape(r);
    expect(shape.chartable).toBe(true);
    expect(shape.defaultType).toBe('line');
  });

  it('defaults a categorical+numeric result to a bar chart', () => {
    const r = result(
      ['category', 'revenue'],
      [
        { category: 'A', revenue: 100 },
        { category: 'B', revenue: 200 },
      ],
    );
    expect(inferChartShape(r).defaultType).toBe('bar');
  });

  it('falls back to a table for non-chartable shapes', () => {
    const r = result(['a', 'b', 'c'], [{ a: 1, b: 2, c: 3 }]);
    const shape = inferChartShape(r);
    expect(shape.chartable).toBe(false);
    expect(shape.defaultType).toBe('table');
  });

  it('charts a WIDE temporal result as a line and picks x/y', () => {
    // The stock-trace shape: trade_date + 4 numeric columns.
    const r = result(
      ['trade_date', 'close_price', 'change_pct', 'volume', 'amount'],
      [
        {
          trade_date: '2025-06-22',
          close_price: 27.54,
          change_pct: 0.04,
          volume: 22950,
          amount: 1,
        },
        {
          trade_date: '2025-06-23',
          close_price: 27.86,
          change_pct: 1.16,
          volume: 29568,
          amount: 2,
        },
      ],
    );
    const shape = inferChartShape(r);
    expect(shape.chartable).toBe(true);
    expect(shape.defaultType).toBe('line');
    expect(shape.xKey).toBe('trade_date');
    expect(shape.yKey).toBe('close_price');
  });

  it('keeps a wide categorical result a table by default but chartable', () => {
    const r = result(
      ['region', 'revenue', 'orders'],
      [
        { region: 'NA', revenue: 100, orders: 5 },
        { region: 'EU', revenue: 80, orders: 4 },
      ],
    );
    const shape = inferChartShape(r);
    expect(shape.chartable).toBe(true);
    expect(shape.defaultType).toBe('table');
    expect(shape.xKey).toBe('region');
    expect(shape.yKey).toBe('revenue');
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
