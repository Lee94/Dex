import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultCard } from '@/components/ResultCard';

const byCategory = {
  columns: ['category', 'revenue'],
  rows: [
    { category: 'A', revenue: 100 },
    { category: 'B', revenue: 200 },
  ],
  rowCount: 2,
  truncated: false,
};

describe('ResultCard', () => {
  it('renders a result as a table (charts live in the thread chart)', () => {
    render(<ResultCard result={byCategory} />);
    expect(screen.getByRole('table')).toBeTruthy();
    // No in-card chart toggles anymore.
    expect(screen.queryByRole('button', { name: 'Line' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bar' })).toBeNull();
  });

  it('renders an empty-result state', () => {
    render(<ResultCard result={{ columns: ['a'], rows: [], rowCount: 0, truncated: false }} />);
    expect(screen.getByText('No rows returned.')).toBeTruthy();
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
