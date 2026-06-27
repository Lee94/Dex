import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton, ConfirmDialog } from '@/components/ui';
import { kindColorVar, type DataSource } from '@/lib/dataSources';
import type { DataBrowserState } from '@/hooks/useDataBrowser';
import { useT } from '@/i18n';
import styles from './dataBrowser.module.css';

/** Left pane level 1: the registered data sources + "Add data connection". */
export function SourceList({
  db,
  onAddConnection,
}: {
  db: DataBrowserState;
  onAddConnection: () => void;
}) {
  const t = useT();
  return (
    <>
      <div className={styles.listScroll}>
        <div className={styles.sectionLabel}>{t.sourceList.allSources}</div>
        {db.sourcesLoading ? (
          <div className={styles.center}>
            <div className={styles.spinner} />
          </div>
        ) : db.sourcesError ? (
          <div className={styles.center}>
            <Icon name="warning" size={20} color="var(--dex-danger-fg)" />
            <div className={styles.errorText}>{db.sourcesError}</div>
            <Button variant="ghost" onClick={() => void db.refreshSources()}>
              {t.common.retry}
            </Button>
          </div>
        ) : (
          db.sources.map((s) => <SourceRow key={s.id} source={s} db={db} />)
        )}
      </div>
      <div className={styles.listFooter}>
        <Button variant="ghost" onClick={onAddConnection} style={{ flex: 1 }}>
          <Icon name="plus" size={14} style={{ marginRight: 6 }} />
          {t.sourceList.addConnection}
        </Button>
      </div>
    </>
  );
}

function SourceRow({ source, db }: { source: DataSource; db: DataBrowserState }) {
  const t = useT();
  const active = db.selectedConnId === source.id;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={`${styles.sourceRow} ${active ? styles.sourceRowActive : ''}`}>
      <button
        type="button"
        className={styles.sourceMainBtn}
        onClick={() => db.selectConn(source.id)}
      >
        <span className={styles.sourceIcon}>
          <Icon name="data" size={18} color={kindColorVar(source.dialect)} />
        </span>
        <span className={styles.sourceMain}>
          <span className={styles.sourceNameRow}>
            <span className={styles.sourceName}>{source.name}</span>
            {source.isAgentSource ? (
              <span className={styles.agentTag}>{t.sourceList.agent}</span>
            ) : null}
          </span>
          <span className={styles.sourceSub}>
            {source.type === 'postgres' ? 'Postgres' : 'SQLite'} · {source.target}
          </span>
        </span>
      </button>
      {source.isBuiltin ? null : (
        <IconButton
          icon="trash"
          size={14}
          color="var(--dex-icon-subtle)"
          title={t.sourceList.deleteConnection}
          hover="mid"
          className={styles.rowDelete}
          onClick={() => setConfirming(true)}
        />
      )}
      {confirming ? (
        <ConfirmDialog
          title={t.sourceList.confirmTitle}
          message={
            <>
              {t.sourceList.confirmBefore}
              <strong>{source.name}</strong>
              {t.sourceList.confirmAfter}
            </>
          }
          confirmLabel={t.sourceList.deleteConnection}
          onConfirm={() => db.removeConnection(source.id)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
