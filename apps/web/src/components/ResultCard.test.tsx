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
