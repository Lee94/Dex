import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton, Pill } from '@/components/ui';
import { isSqlResult } from '@/types';
import styles from './ResultCard.module.css';

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function fmt(v: unknown): string {
  const n = toNumber(v);
  if (n !== null) return n.toLocaleString();
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Renders a run_sql / query_semantic tool result as the design's result card. */
export function ResultCard({
  result,
  sql,
  endorsed = false,
}: {
  result: unknown;
  sql?: string;
  endorsed?: boolean;
}) {
  const [showSql, setShowSql] = useState(false);

  if (!isSqlResult(result)) {
    // Fallback for non-SQL tool output: compact JSON.
    return <pre className={styles.json}>{JSON.stringify(result, null, 2)}</pre>;
  }

  const { columns, rows, rowCount, truncated } = result;

  // Chartable when there are exactly 2 columns and the 2nd is numeric.
  const numericValues = rows.map((r) => toNumber(r[columns[1]]));
  const isChartable =
    columns.length === 2 &&
    rows.length > 0 &&
    rows.length <= 25 &&
    numericValues.every((n) => n !== null);
  const max = isChartable ? Math.max(1, ...numericValues.map((n) => n as number)) : 1;

  return (
    <div className={styles.card}>
      {/* header */}
      <div className={styles.header}>
        <span className={styles.title}>
          {isChartable ? `${columns[1]} by ${columns[0]}` : 'Query results'}
        </span>
        {sql ? (
          <button
            className={`${styles.sqlBtn}${showSql ? ` ${styles.sqlOn}` : ''}`}
            title="Toggle SQL"
            onClick={() => setShowSql((s) => !s)}
          >
            SQL
          </button>
        ) : null}
        <IconButton icon="maximize" size={14} color="var(--dex-icon)" title="Expand" hover="mid" />
      </div>

      {sql && showSql ? <pre className={styles.sqlPre}>{sql}</pre> : null}

      {/* body */}
      {isChartable ? (
        <div className={styles.chart}>
          <div className={styles.axisTop}>{columns[0]}</div>
          <div className={styles.bars}>
            {rows.map((r, i) => {
              const v = numericValues[i] as number;
              return (
                <div key={i} className={styles.barRow}>
                  <div className={styles.barLabel} title={String(r[columns[0]])}>
                    {String(r[columns[0]] ?? '')}
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.bar} style={{ width: `${(v / max) * 100}%` }} />
                    <span className={styles.barValue}>{v.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.axisBottom}>{columns[1]}</div>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      {/* footer */}
      <div className={styles.footer}>
        <span className={styles.rowCount}>
          <Icon name="collections" size={13} color="var(--dex-icon-subtle)" />
          {rowCount.toLocaleString()} {rowCount === 1 ? 'row' : 'rows'}
          {truncated ? ' (showing first 1,000)' : ''}
        </span>
        {endorsed ? (
          <Pill tone="endorsed">
            <Icon name="tickCircle" size={12} color="currentColor" />
            Trusted definition
          </Pill>
        ) : null}
        <Pill tone="success">
          <Icon name="tickCircle" size={12} color="currentColor" />
          Read-only
        </Pill>
      </div>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Array<Record<string, unknown>> }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className={styles.th}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const n = toNumber(r[c]);
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
