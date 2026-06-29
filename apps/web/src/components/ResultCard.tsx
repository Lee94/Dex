import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton, Pill, Modal } from '@/components/ui';
import { isSqlResult, toCsv } from '@/types';
import { DataGrid } from './DataGrid';
import type { PinInput } from '@/lib/reports';
import { useT } from '@/i18n';
import styles from './ResultCard.module.css';

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
  onPin,
}: {
  result: unknown;
  sql?: string;
  endorsed?: boolean;
  /** Header label; falls back to "Query results". */
  title?: string;
  /** Pin this table into the thread's report (v3.4). Omitted in read-only views. */
  onPin?: (input: PinInput) => void;
}) {
  const t = useT();
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState<'' | 'csv' | 'sql'>('');
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);

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
        <span className={styles.title}>{title || t.resultCard.title}</span>

        {sql ? (
          <button
            className={`${styles.toolBtn}${showSql ? ` ${styles.toolOn}` : ''}`}
            title={t.resultCard.toggleSql}
            onClick={() => setShowSql((s) => !s)}
          >
            SQL
          </button>
        ) : null}

        {!isEmpty ? (
          <button
            className={styles.toolBtn}
            title={t.resultCard.downloadCsv}
            onClick={() => downloadFile(toCsv(result), 'dex-result.csv', 'text/csv;charset=utf-8')}
          >
            CSV
          </button>
        ) : null}

        {!isEmpty ? (
          <button
            className={styles.toolBtn}
            title={t.resultCard.copyTable}
            onClick={() => void copyText(toCsv(result)).then(() => flash('csv'))}
          >
            {copied === 'csv' ? t.resultCard.copied : t.resultCard.copy}
          </button>
        ) : null}

        {onPin && !isEmpty ? (
          <button
            className={styles.toolBtn}
            title={t.resultCard.pin}
            onClick={() => {
              onPin({
                kind: 'table',
                title: title || t.resultCard.title,
                payload: { ...result, sql, endorsed },
              });
              setPinned(true);
              window.setTimeout(() => setPinned(false), 1400);
            }}
          >
            {pinned ? t.resultCard.pinned : t.resultCard.pin}
          </button>
        ) : null}

        {!isEmpty ? (
          <IconButton
            icon="maximize"
            size={14}
            color="var(--dex-icon)"
            title={t.resultCard.fullscreen}
            hover="mid"
            onClick={() => setExpanded(true)}
          />
        ) : null}
      </div>

      {sql && showSql ? (
        <div className={styles.sqlBlock}>
          <pre className={styles.sqlPre}>{sql}</pre>
          <button
            className={styles.toolBtn}
            title={t.resultCard.copySql}
            onClick={() => void copyText(sql).then(() => flash('sql'))}
          >
            {copied === 'sql' ? t.resultCard.copied : t.resultCard.copySql}
          </button>
        </div>
      ) : null}

      {/* body */}
      {isEmpty ? (
        <div className={styles.empty}>
          <Icon name="collections" size={20} color="var(--dex-icon-faint)" />
          <span>{t.resultCard.noRows}</span>
        </div>
      ) : (
        <DataGrid columns={columns} rows={rows} />
      )}

      {/* footer */}
      <div className={styles.footer}>
        <span className={styles.rowCount}>
          <Icon name="collections" size={13} color="var(--dex-icon-subtle)" />
          {t.resultCard.rowCount(rowCount, truncated)}
        </span>
        {endorsed ? (
          <Pill tone="endorsed">
            <Icon name="tickCircle" size={12} color="currentColor" />
            {t.resultCard.trustedDefinition}
          </Pill>
        ) : null}
        <Pill tone="success">
          <Icon name="tickCircle" size={12} color="currentColor" />
          {t.resultCard.readOnly}
        </Pill>
      </div>

      {expanded ? (
        <Modal
          title={title || t.resultCard.title}
          size="fullscreen"
          onClose={() => setExpanded(false)}
        >
          <DataGrid columns={columns} rows={rows} fill />
        </Modal>
      ) : null}
    </div>
  );
}
