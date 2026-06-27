import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton, Pill } from '@/components/ui';
import { isSqlResult, toCsv, toNum } from '@/types';
import styles from './ResultCard.module.css';

function fmt(v: unknown): string {
  const n = toNum(v);
  if (n !== null) return n.toLocaleString();
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Copy text to the clipboard, falling back to a hidden textarea. */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/** Trigger a browser download of `content` as a file. */
function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Renders a RunSQL / ShowSemanticTable / ShowSql result as a **table** card.
 * Charting lives in the thread chart (see components/thread/ThreadChart) — result
 * cards are table-only.
 */
export function ResultCard({
  result,
  sql,
  endorsed = false,
  title,
}: {
  result: unknown;
  sql?: string;
  endorsed?: boolean;
  /** Header label; falls back to "Query results". */
  title?: string;
}) {
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState<'' | 'csv' | 'sql'>('');

  if (!isSqlResult(result)) {
    return <pre className={styles.json}>{JSON.stringify(result, null, 2)}</pre>;
  }

  const { columns, rows, rowCount, truncated } = result;
  const isEmpty = rows.length === 0;

  const flash = (which: 'csv' | 'sql') => {
    setCopied(which);
    window.setTimeout(() => setCopied(''), 1400);
  };

  return (
    <div className={styles.card}>
      {/* header */}
      <div className={styles.header}>
        <span className={styles.title}>{title || 'Query results'}</span>

        {sql ? (
          <button
            className={`${styles.toolBtn}${showSql ? ` ${styles.toolOn}` : ''}`}
            title="Toggle SQL"
            onClick={() => setShowSql((s) => !s)}
          >
            SQL
          </button>
        ) : null}

        {!isEmpty ? (
          <button
            className={styles.toolBtn}
            title="Download as CSV"
            onClick={() => downloadFile(toCsv(result), 'dex-result.csv', 'text/csv;charset=utf-8')}
          >
            CSV
          </button>
        ) : null}

        {!isEmpty ? (
          <button
            className={styles.toolBtn}
            title="Copy table to clipboard"
            onClick={() => void copyText(toCsv(result)).then(() => flash('csv'))}
          >
            {copied === 'csv' ? 'Copied' : 'Copy'}
          </button>
        ) : null}

        <IconButton icon="maximize" size={14} color="var(--dex-icon)" title="Expand" hover="mid" />
      </div>

      {sql && showSql ? (
        <div className={styles.sqlBlock}>
          <pre className={styles.sqlPre}>{sql}</pre>
          <button
            className={styles.toolBtn}
            title="Copy SQL"
            onClick={() => void copyText(sql).then(() => flash('sql'))}
          >
            {copied === 'sql' ? 'Copied' : 'Copy SQL'}
          </button>
        </div>
      ) : null}

      {/* body */}
      {isEmpty ? (
        <div className={styles.empty}>
          <Icon name="collections" size={20} color="var(--dex-icon-faint)" />
          <span>No rows returned.</span>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
