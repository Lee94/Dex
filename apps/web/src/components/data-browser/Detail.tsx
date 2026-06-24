import { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import {
  fmtCell,
  fmtCount,
  shortType,
  typeColorVar,
  type ColumnInfo,
  type PreviewResult,
} from '@/lib/dataSources';
import type { DataBrowserState } from '@/hooks/useDataBrowser';
import styles from './dataBrowser.module.css';

/** Right pane: empty state, or the selected table's detail (columns + preview). */
export function Detail({ db }: { db: DataBrowserState }) {
  if (!db.selectedConnId || !db.selectedTable) {
    return (
      <div className={styles.detailEmpty}>
        <Icon name="data" size={30} color="var(--dex-text-faintest)" />
        <div className={styles.detailEmptyTitle}>No data selected</div>
        <div className={styles.detailEmptySub}>
          Select a data connection and table to get started.
        </div>
      </div>
    );
  }
  return <TableDetail db={db} />;
}

function TableDetail({ db }: { db: DataBrowserState }) {
  const table = db.selectedTable!;
  const { detail, detailLoading, detailError } = db;
  const rowCount = db.visibleSchemas
    .flatMap((s) => s.tables)
    .find((t) => t.name === table)?.rowCount;

  return (
    <div className={styles.detailScroll}>
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.crumb} onClick={db.backToSources}>
          {db.selectedSource?.name}
        </button>
        <Icon name="chevronRight" size={11} color="var(--dex-icon-faint)" />
        <span className={styles.crumbCurrent}>{table}</span>
      </div>

      <div className={styles.detailHeaderRow}>
        <Icon name="table" size={18} color="var(--dex-icon)" />
        <span className={styles.detailTitle}>{table}</span>
        <span className={styles.kindBadge}>Table</span>
        {detail?.metadata.status === 'endorsed' ? <Pill tone="endorsed">Endorsed</Pill> : null}
      </div>

      {detailLoading ? (
        <div className={styles.center}>
          <div className={styles.spinner} />
        </div>
      ) : detailError ? (
        <div className={styles.center}>
          <Icon name="warning" size={18} color="var(--dex-danger-fg)" />
          <div className={styles.errorText}>{detailError}</div>
          <Button variant="ghost" onClick={() => db.selectTable(table)}>
            Retry
          </Button>
        </div>
      ) : detail ? (
        <>
          <DescriptionEditable
            value={detail.metadata.description}
            onSave={(v) => void db.patchMetadata({ table, description: v || null })}
          />

          <div className={styles.metaGrid}>
            <div className={styles.metaCol}>
              <span className={styles.metaLabel}>Status</span>
              <StatusControl
                status={detail.metadata.status}
                onToggle={() =>
                  void db.patchMetadata({
                    table,
                    status: detail.metadata.status === 'endorsed' ? null : 'endorsed',
                  })
                }
              />
            </div>
            <div className={styles.metaCol}>
              <span className={styles.metaLabel}>Categories</span>
              <CategoriesControl
                categories={detail.metadata.categories}
                onChange={(categories) => void db.patchMetadata({ table, categories })}
              />
            </div>
            <div className={styles.metaCol}>
              <span className={styles.metaLabel}>Included for AI</span>
              <div className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggle} ${detail.metadata.includedForAi ? styles.toggleOn : ''}`}
                  onClick={() =>
                    void db.patchMetadata({ table, includedForAi: !detail.metadata.includedForAi })
                  }
                  aria-label="Toggle included for AI"
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
            </div>
          </div>

          <div className={styles.statChips}>
            <div className={styles.statChip}>
              <span className={styles.statValue}>
                {rowCount != null ? fmtCount(rowCount) : '—'}
              </span>
              <span className={styles.statLabel}>Rows</span>
            </div>
            <div className={styles.statChip}>
              <span className={styles.statValue}>{detail.columns.length}</span>
              <span className={styles.statLabel}>Columns</span>
            </div>
          </div>

          <div className={styles.detailTabs}>
            <button
              type="button"
              className={`${styles.detailTab} ${db.detailTab === 'columns' ? styles.detailTabActive : ''}`}
              onClick={() => db.pickDetailTab('columns')}
            >
              Columns
            </button>
            <button
              type="button"
              className={`${styles.detailTab} ${db.detailTab === 'preview' ? styles.detailTabActive : ''}`}
              onClick={() => db.pickDetailTab('preview')}
            >
              Preview
            </button>
          </div>

          {db.detailTab === 'columns' ? (
            <ColumnsTab
              columns={detail.columns}
              onSaveColumnDesc={(col, v) =>
                void db.patchMetadata({ table, column: col, description: v || null })
              }
            />
          ) : (
            <PreviewTab
              table={table}
              preview={db.preview}
              loading={db.previewLoading}
              error={db.previewError}
              onRetry={() => db.pickDetailTab('preview')}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function ColumnsTab({
  columns,
  onSaveColumnDesc,
}: {
  columns: ColumnInfo[];
  onSaveColumnDesc: (column: string, value: string) => void;
}) {
  return (
    <div className={styles.colTable}>
      <div className={styles.colHeadRow}>
        <span className={`${styles.colNameCell} ${styles.colHeadCell}`}>Column</span>
        <span className={`${styles.colTypeCell} ${styles.colHeadCell}`}>Type</span>
        <span className={`${styles.colDescCell} ${styles.colHeadCell}`}>Description</span>
      </div>
      {columns.map((col) => (
        <div key={col.name} className={styles.colRow}>
          <span className={styles.colNameCell}>
            <span className={styles.colName}>{col.name}</span>
            {col.primaryKey ? <span className={styles.pkBadge}>PK</span> : null}
          </span>
          <span className={styles.colTypeCell}>
            <span className={styles.typeDot} style={{ background: typeColorVar(col.type) }} />
            <span className={styles.colType}>{shortType(col.type)}</span>
          </span>
          <span className={styles.colDescCell}>
            <DescriptionEditable
              value={col.description}
              inline
              onSave={(v) => onSaveColumnDesc(col.name, v)}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function PreviewTab({
  table,
  preview,
  loading,
  error,
  onRetry,
}: {
  table: string;
  preview: PreviewResult | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} />
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.center}>
        <Icon name="warning" size={18} color="var(--dex-danger-fg)" />
        <div className={styles.errorText}>{error}</div>
        <Button variant="ghost" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!preview) return null;
  return (
    <>
      <DataGrid columns={preview.columns} rows={preview.rows} />
      <div className={styles.gridCaption}>
        Showing first {preview.rows.length} rows of {table}
      </div>
    </>
  );
}

/** Shared read-only data grid (table preview + model preview). */
export function DataGrid({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  if (columns.length === 0) {
    return <div className={styles.emptyTree}>No data.</div>;
  }
  return (
    <div className={styles.gridWrap}>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th className={styles.gridNum}>#</th>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className={styles.gridNum}>{i + 1}</td>
              {columns.map((c) => (
                <td key={c}>{fmtCell(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- metadata editing controls ---------------------------------------------

function DescriptionEditable({
  value,
  onSave,
  inline,
}: {
  value: string | null;
  onSave: (value: string) => void;
  inline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);

  if (editing) {
    return (
      <textarea
        autoFocus
        className={styles.descInput}
        rows={inline ? 1 : 2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== (value ?? '')) onSave(draft);
        }}
      />
    );
  }
  return (
    <div
      className={inline ? styles.colDescEmpty : styles.descEditable}
      onClick={() => setEditing(true)}
    >
      {value ? value : <span className={styles.descPlaceholder}>Add a description...</span>}
    </div>
  );
}

function StatusControl({ status, onToggle }: { status: string | null; onToggle: () => void }) {
  if (status === 'endorsed') {
    return (
      <button type="button" className={styles.metaAdd} onClick={onToggle}>
        <Icon name="tickCircle" size={12} color="var(--dex-success-check)" />
        Endorsed
      </button>
    );
  }
  return (
    <button type="button" className={styles.metaAdd} onClick={onToggle}>
      <Icon name="plus" size={11} />
      Add status
    </button>
  );
}

function CategoriesControl({
  categories,
  onChange,
}: {
  categories: string[];
  onChange: (categories: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const v = draft.trim();
    setAdding(false);
    setDraft('');
    if (v && !categories.includes(v)) onChange([...categories, v]);
  };

  return (
    <div className={styles.toggleRow} style={{ flexWrap: 'wrap', gap: 6 }}>
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          className={styles.metaAdd}
          title="Remove category"
          onClick={() => onChange(categories.filter((x) => x !== c))}
        >
          {c}
          <Icon name="cross" size={10} />
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          className={styles.input}
          style={{ height: 23, width: 120 }}
          value={draft}
          placeholder="Category"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setAdding(false);
              setDraft('');
            }
          }}
        />
      ) : (
        <button type="button" className={styles.metaAdd} onClick={() => setAdding(true)}>
          <Icon name="plus" size={11} />
          Add categories
        </button>
      )}
    </div>
  );
}
