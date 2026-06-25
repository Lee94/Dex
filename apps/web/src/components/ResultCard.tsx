import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton, Pill } from '@/components/ui';
import {
  type ChartType,
  type ColumnType,
  inferChartShape,
  isSqlResult,
  toCsv,
  toNum,
} from '@/types';
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

const CHART_LABELS: Record<ChartType, string> = {
  table: 'Table',
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
};

/** Renders a run_sql / query_semantic tool result as the design's result card. */
export function ResultCard({
  result,
  sql,
  endorsed = false,
  title,
}: {
  result: unknown;
  sql?: string;
  endorsed?: boolean;
  /** Header label; falls back to a derived "… by …" / "Query results". */
  title?: string;
}) {
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState<'' | 'csv' | 'sql'>('');

  const shape = useMemo(() => (isSqlResult(result) ? inferChartShape(result) : null), [result]);
  const [view, setView] = useState<ChartType | null>(null);

  if (!isSqlResult(result) || !shape) {
    // Fallback for non-SQL tool output: compact JSON.
    return <pre className={styles.json}>{JSON.stringify(result, null, 2)}</pre>;
  }

  const { columns, rows, rowCount, truncated } = result;
  const { chartable, defaultType, columnTypes } = shape;
  const active: ChartType = view ?? defaultType;
  const isEmpty = rows.length === 0;

  const flash = (which: 'csv' | 'sql') => {
    setCopied(which);
    window.setTimeout(() => setCopied(''), 1400);
  };

  const headerLabel = title || (chartable ? `${columns[1]} by ${columns[0]}` : 'Query results');

  return (
    <div className={styles.card}>
      {/* header */}
      <div className={styles.header}>
        <span className={styles.title}>{headerLabel}</span>

        {chartable && !isEmpty ? (
          <div className={styles.segmented} role="group" aria-label="Chart type">
            {(['table', 'bar', 'line', 'area'] as ChartType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`${styles.segBtn}${active === t ? ` ${styles.segOn}` : ''}`}
                aria-pressed={active === t}
                onClick={() => setView(t)}
              >
                {CHART_LABELS[t]}
              </button>
            ))}
          </div>
        ) : null}

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
            onClick={() => {
              downloadFile(toCsv(result), 'dex-result.csv', 'text/csv;charset=utf-8');
            }}
          >
            CSV
          </button>
        ) : null}

        {!isEmpty ? (
          <button
            className={styles.toolBtn}
            title="Copy table to clipboard"
            onClick={() => {
              void copyText(toCsv(result)).then(() => flash('csv'));
            }}
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
            onClick={() => {
              void copyText(sql).then(() => flash('sql'));
            }}
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
      ) : active === 'bar' ? (
        <BarChart columns={columns} rows={rows} />
      ) : active === 'line' || active === 'area' ? (
        <LineChart
          columns={columns}
          rows={rows}
          columnTypes={columnTypes}
          area={active === 'area'}
        />
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

/** Horizontal bar chart — a 2-column category→numeric result. */
function BarChart({ columns, rows }: { columns: string[]; rows: Array<Record<string, unknown>> }) {
  const values = rows.map((r) => toNum(r[columns[1]]) ?? 0);
  const max = Math.max(1, ...values);
  return (
    <div className={styles.chart}>
      <div className={styles.axisTop}>{columns[0]}</div>
      <div className={styles.bars}>
        {rows.map((r, i) => (
          <div key={i} className={styles.barRow}>
            <div className={styles.barLabel} title={String(r[columns[0]])}>
              {String(r[columns[0]] ?? '')}
            </div>
            <div className={styles.barTrack}>
              <div className={styles.bar} style={{ width: `${(values[i] / max) * 100}%` }} />
              <span className={styles.barValue}>{values[i].toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.axisBottom}>{columns[1]}</div>
    </div>
  );
}

/** Ordered line/area chart — sorts a temporal x ascending; SVG, no deps. */
function LineChart({
  columns,
  rows,
  columnTypes,
  area,
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  columnTypes: ColumnType[];
  area: boolean;
}) {
  const [xCol, yCol] = columns;
  const data = rows
    .map((r) => ({ label: String(r[xCol] ?? ''), y: toNum(r[yCol]) ?? 0 }))
    .sort((a, b) => (columnTypes[0] === 'temporal' ? a.label.localeCompare(b.label) : 0));

  const W = 640;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(1, ...data.map((d) => d.y));
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const linePts = data.map((d, i) => `${x(i)},${y(d.y)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ${linePts} ${padL + innerW},${padT + innerH}`;

  // Up to ~6 x-axis ticks so labels don't collide.
  const step = Math.max(1, Math.ceil(n / 6));
  const ticks = data.map((d, i) => ({ d, i })).filter(({ i }) => i % step === 0 || i === n - 1);

  return (
    <div className={styles.chart}>
      <div className={styles.axisTop}>{yCol}</div>
      <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`}>
        {/* baseline + midline grid */}
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          stroke="var(--dex-chart-grid)"
        />
        <line
          x1={padL}
          y1={padT + innerH / 2}
          x2={padL + innerW}
          y2={padT + innerH / 2}
          stroke="var(--dex-chart-grid)"
          strokeDasharray="3 3"
        />
        {area ? <polygon points={areaPts} fill="var(--dex-chart-area)" /> : null}
        <polyline
          points={linePts}
          fill="none"
          stroke="var(--dex-chart-line)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.y)} r={2.5} fill="var(--dex-chart-point)" />
        ))}
        {ticks.map(({ d, i }) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            className={styles.svgTick}
          >
            {d.label}
          </text>
        ))}
      </svg>
      <div className={styles.axisBottom}>{xCol}</div>
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
