import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton, Pill } from '@/components/ui';
import {
  type ChartHint,
  type ChartType,
  classifyColumns,
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

/** Renders a run_sql / query_semantic / create_sql_cell result as a result card. */
export function ResultCard({
  result,
  sql,
  endorsed = false,
  title,
  chart,
}: {
  result: unknown;
  sql?: string;
  endorsed?: boolean;
  /** Header label; falls back to a derived "… by …" / "Query results". */
  title?: string;
  /** Optional visualization hint (chart type + x/y columns) from the agent. */
  chart?: ChartHint;
}) {
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState<'' | 'csv' | 'sql'>('');

  const shape = useMemo(() => (isSqlResult(result) ? inferChartShape(result) : null), [result]);
  const columnTypes = useMemo(() => (isSqlResult(result) ? classifyColumns(result) : []), [result]);
  const [view, setView] = useState<ChartType | null>(null);
  // x/y the chart plots — start from the hint, else the inferred axes.
  const [axes, setAxes] = useState<{ x?: string; y?: string } | null>(null);

  if (!isSqlResult(result) || !shape) {
    return <pre className={styles.json}>{JSON.stringify(result, null, 2)}</pre>;
  }

  const { columns, rows, rowCount, truncated } = result;
  const isEmpty = rows.length === 0;

  const has = (c?: string): c is string => !!c && columns.includes(c);
  const xKey = axes?.x ?? (has(chart?.x) ? chart!.x : shape.xKey);
  const yKey = axes?.y ?? (has(chart?.y) ? chart!.y : shape.yKey);
  const hintType = chart?.type;
  // Chartable when we have an x+y pair and either inference said so, or the agent
  // explicitly asked for a (non-table) chart.
  const canChart =
    has(xKey) && has(yKey) && (shape.chartable || (!!hintType && hintType !== 'table'));
  const defaultType: ChartType = hintType ?? shape.defaultType;
  const active: ChartType = view ?? defaultType;
  const showChart = canChart && active !== 'table';
  const xIsTemporal = has(xKey) && columnTypes[columns.indexOf(xKey)] === 'temporal';

  const flash = (which: 'csv' | 'sql') => {
    setCopied(which);
    window.setTimeout(() => setCopied(''), 1400);
  };

  const headerLabel =
    title || (canChart && has(yKey) && has(xKey) ? `${yKey} by ${xKey}` : 'Query results');

  // y candidates for the picker: the numeric columns (other than x).
  const numericCols = columns.filter((c) => columnTypes[columns.indexOf(c)] === 'numeric');

  return (
    <div className={styles.card}>
      {/* header */}
      <div className={styles.header}>
        <span className={styles.title}>{headerLabel}</span>

        {canChart && !isEmpty ? (
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

      {/* axis pickers — only when charting a wide result (>2 cols) */}
      {showChart && columns.length > 2 ? (
        <div className={styles.axisPickers}>
          <label className={styles.axisPicker}>
            x
            <select value={xKey ?? ''} onChange={(e) => setAxes({ x: e.target.value, y: yKey })}>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.axisPicker}>
            y
            <select value={yKey ?? ''} onChange={(e) => setAxes({ x: xKey, y: e.target.value })}>
              {numericCols.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

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
      ) : showChart && active === 'bar' && has(xKey) && has(yKey) ? (
        <BarChart rows={rows} xKey={xKey} yKey={yKey} />
      ) : showChart && (active === 'line' || active === 'area') && has(xKey) && has(yKey) ? (
        <LineChart
          rows={rows}
          xKey={xKey}
          yKey={yKey}
          temporal={xIsTemporal}
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

/** Horizontal bar chart of yKey by xKey. */
function BarChart({
  rows,
  xKey,
  yKey,
}: {
  rows: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
}) {
  const values = rows.map((r) => toNum(r[yKey]) ?? 0);
  const max = Math.max(1, ...values);
  return (
    <div className={styles.chart}>
      <div className={styles.axisTop}>{xKey}</div>
      <div className={styles.bars}>
        {rows.map((r, i) => (
          <div key={i} className={styles.barRow}>
            <div className={styles.barLabel} title={String(r[xKey])}>
              {String(r[xKey] ?? '')}
            </div>
            <div className={styles.barTrack}>
              <div className={styles.bar} style={{ width: `${(values[i] / max) * 100}%` }} />
              <span className={styles.barValue}>{values[i].toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.axisBottom}>{yKey}</div>
    </div>
  );
}

/** Ordered line/area chart of yKey over xKey; sorts a temporal x ascending. SVG, no deps. */
function LineChart({
  rows,
  xKey,
  yKey,
  temporal,
  area,
}: {
  rows: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  temporal: boolean;
  area: boolean;
}) {
  const data = rows
    .map((r) => ({ label: String(r[xKey] ?? ''), y: toNum(r[yKey]) ?? 0 }))
    .sort((a, b) => (temporal ? a.label.localeCompare(b.label) : 0));

  const W = 640;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(1, ...data.map((d) => d.y));
  const min = Math.min(0, ...data.map((d) => d.y));
  const span = max - min || 1;
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / span) * innerH;

  const linePts = data.map((d, i) => `${x(i)},${y(d.y)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ${linePts} ${padL + innerW},${padT + innerH}`;
  const step = Math.max(1, Math.ceil(n / 6));
  const ticks = data.map((d, i) => ({ d, i })).filter(({ i }) => i % step === 0 || i === n - 1);

  return (
    <div className={styles.chart}>
      <div className={styles.axisTop}>{yKey}</div>
      <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`}>
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
        {n <= 120
          ? data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(d.y)} r={2.5} fill="var(--dex-chart-point)" />
            ))
          : null}
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
      <div className={styles.axisBottom}>{xKey}</div>
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
