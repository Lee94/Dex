import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultCard } from '@/components/ResultCard';

const monthly = {
  columns: ['month', 'revenue'],
  rows: [
    { month: '2024-01', revenue: 100 },
    { month: '2024-02', revenue: 220 },
    { month: '2024-03', revenue: 180 },
  ],
  rowCount: 3,
  truncated: false,
};

const byCategory = {
  columns: ['category', 'revenue'],
  rows: [
    { category: 'A', revenue: 100 },
    { category: 'B', revenue: 200 },
  ],
  rowCount: 2,
  truncated: false,
};

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true';

describe('ResultCard chart inference', () => {
  it('defaults a monthly (temporal) result to the Line view', () => {
    render(<ResultCard result={monthly} />);
    expect(pressed('Line')).toBe(true);
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('defaults a categorical result to the Bar view', () => {
    render(<ResultCard result={byCategory} />);
    expect(pressed('Bar')).toBe(true);
  });

  it('switches to a table when Table is selected', async () => {
    render(<ResultCard result={monthly} />);
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('charts a WIDE time-series result (5 cols) as a Line by default', () => {
    // Regression for the stock trace: a 5-column trade_date series used to fall
    // back to a table; it now defaults to a line and offers the chart toggle.
    const wide = {
      columns: ['trade_date', 'close_price', 'change_pct', 'volume', 'amount'],
      rows: [
        { trade_date: '2025-06-22', close_price: 27.5, change_pct: 0, volume: 22950, amount: 1 },
        { trade_date: '2025-06-23', close_price: 27.9, change_pct: 1.1, volume: 29568, amount: 2 },
        { trade_date: '2025-06-24', close_price: 28.1, change_pct: 1.0, volume: 36346, amount: 3 },
      ],
      rowCount: 3,
      truncated: false,
    };
    render(<ResultCard result={wide} />);
    expect(pressed('Line')).toBe(true);
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('applies an agent chart hint on a wide result', () => {
    const wide = {
      columns: ['region', 'revenue', 'orders'],
      rows: [
        { region: 'NA', revenue: 100, orders: 5 },
        { region: 'EU', revenue: 80, orders: 4 },
      ],
      rowCount: 2,
      truncated: false,
    };
    // categorical-first wide table defaults to table; the hint forces a bar.
    render(<ResultCard result={wide} chart={{ type: 'bar', x: 'region', y: 'orders' }} />);
    expect(pressed('Bar')).toBe(true);
  });
});

describe('ResultCard states', () => {
  it('renders an empty-result state', () => {
    render(<ResultCard result={{ columns: ['a'], rows: [], rowCount: 0, truncated: false }} />);
    expect(screen.getByText('No rows returned.')).toBeTruthy();
  });

  it('renders a 3-column result as a table (not chartable)', () => {
    render(
      <ResultCard
        result={{
          columns: ['a', 'b', 'c'],
          rows: [{ a: 1, b: 2, c: 3 }],
          rowCount: 1,
          truncated: false,
        }}
      />,
    );
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Line' })).toBeNull();
  });
});

describe('ResultCard export', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('copies the result as CSV to the clipboard', async () => {
    render(<ResultCard result={byCategory} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('category,revenue\nA,100\nB,200');
  });
});
