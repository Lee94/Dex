import { useState } from 'react';
import { Placeholder } from '@/components/Placeholder';
import { useDataBrowser, type HeaderTab } from '@/hooks/useDataBrowser';
import { SourceList } from './SourceList';
import { SchemaTree } from './SchemaTree';
import { Detail } from './Detail';
import { DataModelsPanel } from './DataModelsPanel';
import { AddConnectionDialog } from './AddConnectionDialog';
import styles from './dataBrowser.module.css';

const TABS: { key: HeaderTab; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'datamodels', label: 'Data models' },
  { key: 'curation', label: 'Curation' },
];

/** The data-source module (v0.6) — implements DataBrowser.dc.html. */
export function DataBrowserView() {
  const db = useDataBrowser();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.logo}>
          <CubeMark />
        </span>
        <h1 className={styles.title}>Data browser</h1>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.tab} ${db.headerTab === t.key ? styles.tabActive : ''}`}
            onClick={() => db.pickHeader(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {db.headerTab === 'warehouse' ? (
        <div className={styles.body}>
          <div className={styles.left}>
            {db.selectedConnId ? (
              <SchemaTree db={db} />
            ) : (
              <SourceList db={db} onAddConnection={() => setAddOpen(true)} />
            )}
          </div>
          <div className={styles.right}>
            <Detail db={db} />
          </div>
        </div>
      ) : db.headerTab === 'datamodels' ? (
        <div className={styles.right}>
          <DataModelsPanel db={db} />
        </div>
      ) : (
        <Placeholder
          icon={db.headerTab === 'recommended' ? 'dashboard' : 'tickCircle'}
          title={db.headerTab === 'recommended' ? 'Recommended' : 'Curation'}
          subtitle="Nothing here yet."
        />
      )}

      {addOpen ? (
        <AddConnectionDialog onClose={() => setAddOpen(false)} onSubmit={db.addConnection} />
      ) : null}
    </div>
  );
}

/** The purple cube brand mark from the design (24×24, token-tinted). */
function CubeMark() {
  return (
    <svg viewBox="0 0 24 24" width={25} height={25} fill="none" aria-hidden="true">
      <path
        d="M12 2 4 6.5v9L12 20l8-4.5v-9zM12 2v18M4 6.5l8 4.5 8-4.5"
        stroke="var(--dex-logo-purple)"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}
