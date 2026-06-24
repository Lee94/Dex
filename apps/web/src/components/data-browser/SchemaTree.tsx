import { Icon } from '@/lib/icons';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { fmtCount, kindColorVar } from '@/lib/dataSources';
import type { DataBrowserState } from '@/hooks/useDataBrowser';
import styles from './dataBrowser.module.css';

/** Left pane level 2: the drilled-in schema/table tree for the selected source. */
export function SchemaTree({ db }: { db: DataBrowserState }) {
  const source = db.selectedSource;
  return (
    <>
      <div className={styles.treeTop}>
        <button type="button" className={styles.backLink} onClick={db.backToSources}>
          <Icon name="chevronLeft" size={12} />
          All sources
        </button>
        <div className={styles.treeSourceRow}>
          <Icon name="data" size={16} color={kindColorVar(source?.dialect ?? 'sqlite')} />
          <span className={styles.treeSourceName}>{source?.name}</span>
          <IconButton
            icon="refresh"
            size={14}
            title="Refresh metadata"
            hover="mid"
            onClick={db.refresh}
          />
          <IconButton
            icon="minus"
            size={14}
            title="Collapse all"
            hover="mid"
            onClick={db.collapseAll}
          />
        </div>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <Icon name="search" size={13} color="var(--dex-icon-subtle)" />
          </span>
          <input
            className={styles.searchInput}
            placeholder="Search tables..."
            value={db.search}
            onChange={(e) => db.setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.treeScroll}>
        {db.treeLoading ? (
          <div className={styles.center}>
            <div className={styles.spinner} />
          </div>
        ) : db.treeError ? (
          <div className={styles.center}>
            <Icon name="warning" size={18} color="var(--dex-danger-fg)" />
            <div className={styles.errorText}>{db.treeError}</div>
            <Button variant="ghost" onClick={db.refresh}>
              Retry
            </Button>
          </div>
        ) : db.noResults ? (
          <div className={styles.emptyTree}>No schemas or tables match.</div>
        ) : (
          db.visibleSchemas.map((schema) => {
            const open = db.expanded(schema.id);
            return (
              <div key={schema.id}>
                <button
                  type="button"
                  className={styles.schemaRow}
                  onClick={() => db.toggleSchema(schema.id)}
                >
                  <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>
                    <Icon name="chevronRight" size={11} color="var(--dex-icon-subtle)" />
                  </span>
                  <Icon name="folder" size={14} color="var(--dex-icon-subtle)" />
                  <span className={styles.schemaName}>{schema.name}</span>
                  {schema.endorsed ? (
                    <Icon name="tickCircle" size={13} color="var(--dex-success-check)" />
                  ) : null}
                </button>
                {open
                  ? schema.tables.map((t) => {
                      const active = db.selectedTable === t.name;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`${styles.tableRow} ${active ? styles.tableRowActive : ''}`}
                          onClick={() => db.selectTable(t.name)}
                        >
                          <Icon name="table" size={13} color="var(--dex-icon-faint)" />
                          <span className={styles.tableName}>{t.name}</span>
                          {t.endorsed ? (
                            <Icon name="tickCircle" size={12} color="var(--dex-success-check)" />
                          ) : null}
                          <span className={styles.tableCount}>{fmtCount(t.rowCount)}</span>
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
