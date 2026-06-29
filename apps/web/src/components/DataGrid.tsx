import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { toNum } from '@/types';
import { useT } from '@/i18n';
import styles from './DataGrid.module.css';

type SortDir = 'asc' | 'desc';

/** Format a cell: numbers get locale grouping, nullish → empty. */
function fmt(v: unknown): string {
  const n = toNum(v);
  if (n !== null) return n.toLocaleString();
  if (v === null || v === undefined) return '';
  return String(v);
}

// Render rows in pages so a large result doesn't blow up the DOM (replaces the
// old hard 1,000-row cliff with progressive "show more"). The toolbar (filter)
// only appears once a result is big enough to warrant it.
const PAGE = 100;
const TOOLS_THRESHOLD = 10;

/**
 * An interactive result grid (v3.1): click a header to sort (asc → desc → off),
 * filter rows with the search box, and page through large results. Pure
 * client-side over the already-fetched rows — no querying. Used inline in a
 * `ResultCard` (capped height) and full-height in the fullscreen modal (`fill`).
 */
export function DataGrid({
  columns,
  rows,
  bodyMaxHeight = 360,
  fill = false,
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  /** Max height (px) of the scroll body; ignored when `fill`. */
  bodyMaxHeight?: number;
  /** Fill available height (fullscreen) instead of capping. */
  fill?: boolean;
}) {
  const t = useT();
  const [sort, setSort] = useState<{ col: string; dir: SortDir } | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      columns.some((c) => {
        const v = r[c];
        return v != null && String(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { col, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      // Nulls always sort last, regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const an = toNum(av);
      const bn = toNum(bv);
      if (an !== null && bn !== null) return (an - bn) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  }, [filtered, sort]);

  const shown = sorted.slice(0, limit);
  const remaining = sorted.length - shown.length;
  const showTools = rows.length > TOOLS_THRESHOLD;

  // header click cycles asc → desc → unsorted
  const onHeader = (c: string) =>
    setSort((prev) => {
      if (!prev || prev.col !== c) return { col: c, dir: 'asc' };
      if (prev.dir === 'asc') return { col: c, dir: 'desc' };
      return null;
    });

  return (
    <div className={fill ? styles.rootFill : styles.root}>
      {showTools ? (
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Icon name="search" size={13} color="var(--dex-icon-subtle)" />
            <input
              className={styles.searchInput}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder={t.resultCard.searchPlaceholder}
            />
            {query ? (
              <button
                type="button"
                className={styles.searchClear}
                title={t.common.remove}
                onClick={() => setQuery('')}
              >
                <Icon name="cross" size={10} color="var(--dex-icon-subtle)" />
              </button>
            ) : null}
          </div>
          <span className={styles.matchCount}>{t.resultCard.matchRows(sorted.length)}</span>
        </div>
      ) : null}

      <div className={styles.tableWrap} style={fill ? undefined : { maxHeight: bodyMaxHeight }}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.col === c;
                return (
                  <th
                    key={c}
                    className={styles.th}
                    onClick={() => onHeader(c)}
                    title={t.resultCard.sortHint}
                  >
                    <span className={styles.thInner}>
                      <span className={styles.thLabel}>{c}</span>
                      <Icon
                        name={active ? (sort!.dir === 'asc' ? 'chevronUp' : 'chevronDown') : 'caretDown'}
                        size={11}
                        color={active ? 'var(--dex-icon)' : 'var(--dex-icon-faint)'}
                        style={active ? undefined : { opacity: 0.4 }}
                      />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td className={styles.noMatch} colSpan={columns.length}>
                  {t.resultCard.noMatch}
                </td>
              </tr>
            ) : (
              shown.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => {
                    const n = toNum(r[c]);
                    return (
                      <td
                        key={c}
                        className={styles.td}
                        style={{
                          fontFamily: n !== null ? 'var(--dex-mono)' : 'inherit',
                          textAlign: n !== null ? 'right' : 'left',
                        }}
                      >
                        {fmt(r[c])}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {remaining > 0 ? (
        <div className={styles.moreBar}>
          <button
            type="button"
            className={styles.moreBtn}
            onClick={() => setLimit((l) => l + PAGE)}
          >
            {t.resultCard.showMore(Math.min(PAGE, remaining))}
          </button>
          <button
            type="button"
            className={styles.moreBtn}
            onClick={() => setLimit(sorted.length)}
          >
            {t.resultCard.showAll(sorted.length)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
