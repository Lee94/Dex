import { useState } from 'react';
import { Icon } from '../lib/icons';
import { isSqlResult } from '../types';

const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

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

/** Renders a run_sql tool result as the design's result card (bar chart or table). */
export function ResultCard({ result, sql }: { result: unknown; sql?: string }) {
  const [showSql, setShowSql] = useState(false);

  if (!isSqlResult(result)) {
    // Fallback for non-SQL tool output: compact JSON.
    return (
      <pre
        style={{
          margin: '8px 0',
          padding: '12px 14px',
          background: '#f6f7f9',
          border: '1px solid rgba(17,20,24,.1)',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: MONO,
          color: '#404854',
          overflow: 'auto',
          maxHeight: 240,
        }}
      >
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  }

  const { columns, rows, rowCount, truncated } = result;

  // Chartable when there are exactly 2 columns and the 2nd is numeric.
  const numericValues = rows.map((r) => toNumber(r[columns[1]]));
  const isChartable =
    columns.length === 2 && rows.length > 0 && rows.length <= 25 && numericValues.every((n) => n !== null);
  const max = isChartable ? Math.max(1, ...numericValues.map((n) => n as number)) : 1;

  return (
    <div
      style={{
        borderRadius: 6,
        boxShadow: '0 0 0 1px rgba(17,20,24,.12),0 1px 3px rgba(0,0,0,.06)',
        overflow: 'hidden',
        marginBottom: 8,
        background: '#fff',
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '13px 18px',
          boxShadow: '0 1px 0 0 rgba(17,20,24,.08)',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1c2127', flex: 1 }}>
          {isChartable ? `${columns[1]} by ${columns[0]}` : 'Query results'}
        </span>
        {sql ? (
          <button
            className="btn-ghost"
            style={{
              border: 'none',
              background: showSql ? '#f1f3f6' : 'transparent',
              boxShadow: 'inset 0 0 0 1px rgba(17,20,24,.15)',
              borderRadius: 4,
              height: 22,
              padding: '0 8px',
              fontSize: 11.5,
              fontWeight: 500,
              color: '#5f6b7c',
              cursor: 'pointer',
              fontFamily: MONO,
            }}
            title="Toggle SQL"
            onClick={() => setShowSql((s) => !s)}
          >
            SQL
          </button>
        ) : null}
        <button className="ic ic-soft" style={{ padding: 5 }} title="Expand">
          <Icon name="maximize" size={14} color="#5f6b7c" />
        </button>
      </div>

      {sql && showSql ? (
        <pre
          style={{
            margin: 0,
            padding: '12px 18px',
            background: '#f6f7f9',
            boxShadow: '0 1px 0 0 rgba(17,20,24,.06)',
            fontFamily: MONO,
            fontSize: 12,
            color: '#404854',
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
          }}
        >
          {sql}
        </pre>
      ) : null}

      {/* body */}
      {isChartable ? (
        <div style={{ padding: '20px 22px 14px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '.3px',
              textTransform: 'uppercase',
              color: '#abb3bf',
              marginBottom: 12,
            }}
          >
            {columns[0]}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {rows.map((r, i) => {
              const v = numericValues[i] as number;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 160,
                      flex: 'none',
                      fontSize: 12.5,
                      color: '#404854',
                      textAlign: 'right',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={String(r[columns[0]])}
                  >
                    {String(r[columns[0]] ?? '')}
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div
                      style={{
                        height: 19,
                        width: `${(v / max) * 100}%`,
                        minWidth: 3,
                        background: '#5078a8',
                        borderRadius: 2,
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#5078a8', fontFamily: MONO }}>
                      {v.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: '#8f99a8', marginTop: 10 }}>
            {columns[1]}
          </div>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      {/* footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          boxShadow: '0 -1px 0 0 rgba(17,20,24,.08)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#5f6b7c' }}>
          <Icon name="collections" size={13} color="#8f99a8" />
          {rowCount.toLocaleString()} {rowCount === 1 ? 'row' : 'rows'}
          {truncated ? ' (showing first 1,000)' : ''}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 21,
            padding: '0 9px',
            borderRadius: 11,
            background: 'rgba(35,133,81,.12)',
            color: '#1c6e42',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          <Icon name="tickCircle" size={12} color="currentColor" />
          Read-only
        </span>
      </div>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Array<Record<string, unknown>> }) {
  return (
    <div style={{ overflowX: 'auto', maxHeight: 360 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: 'left',
                  padding: '9px 18px',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '.2px',
                  color: '#5f6b7c',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 0 0 rgba(17,20,24,.1)',
                  position: 'sticky',
                  top: 0,
                  background: '#fff',
                }}
              >
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
                    style={{
                      padding: '8px 18px',
                      color: '#1c2127',
                      whiteSpace: 'nowrap',
                      boxShadow: 'inset 0 -1px 0 0 rgba(17,20,24,.06)',
                      fontFamily: n !== null ? MONO : 'inherit',
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
