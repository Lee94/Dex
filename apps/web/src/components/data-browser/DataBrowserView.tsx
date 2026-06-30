import { useEffect, useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Placeholder } from '@/components/Placeholder';
import { useDataBrowser, type DataBrowserState, type HeaderTab } from '@/hooks/useDataBrowser';
import { SourceList } from './SourceList';
import { SchemaTree } from './SchemaTree';
import { Detail } from './Detail';
import { DataModelsPanel } from './DataModelsPanel';
import { AddConnectionDialog } from './AddConnectionDialog';
import { useT, type Dict } from '@/i18n';
import styles from './dataBrowser.module.css';

const route = getRouteApi('/shell/data/{-$connId}/{-$table}');

const TABS: { key: HeaderTab; label: keyof Dict['dataBrowser']['tabs'] }[] = [
  { key: 'recommended', label: 'recommended' },
  { key: 'warehouse', label: 'warehouse' },
  { key: 'datamodels', label: 'dataModels' },
  { key: 'curation', label: 'curation' },
];

/**
 * The data-source module (v0.6) — implements DataBrowser.dc.html. The drill-down
 * (connection → table) is deep-linkable: `/data/:connId/:table`. The URL is the
 * source of truth — selection handlers navigate, and two effects mirror the
 * route back into the self-contained `useDataBrowser` hook. Ephemeral UI state
 * (header tab, detail tab, search, data-model drill-down) stays in the hook.
 */
export function DataBrowserView() {
  const db = useDataBrowser();
  const { connId, table } = route.useParams();
  const { tab: tabHint } = route.useSearch();
  const navigate = useNavigate();
  const tr = useT();
  const [addOpen, setAddOpen] = useState(false);

  // Returning from the full-screen model studio lands here with a tab hint —
  // restore the Data Models tab (the studio's "Back" passes `?tab=datamodels`).
  const { pickHeader } = db;
  useEffect(() => {
    if (tabHint === 'datamodels') pickHeader('datamodels');
  }, [tabHint, pickHeader]);

  // Pull the selection + its stable handles out of the per-render `db` object so
  // the sync effects below depend on plain identifiers.
  const { selectedConnId, selectedTable, selectConn, selectTable, backToSources, gotoSchema } = db;

  // URL → hook: select the routed connection (loads its tree).
  useEffect(() => {
    if (connId) {
      if (connId !== selectedConnId) selectConn(connId);
    } else if (selectedConnId) {
      backToSources();
    }
  }, [connId, selectedConnId, selectConn, backToSources]);

  // URL → hook: select the routed table, but only once its connection is active
  // (so `selectTable`, which reads `selectedConnId`, has it).
  useEffect(() => {
    if (!connId || selectedConnId !== connId) return;
    // `useParams` already decodes; navigate re-encodes when writing the path.
    const t = table ?? null;
    if (t) {
      if (t !== selectedTable) selectTable(t);
    } else if (selectedTable) {
      gotoSchema();
    }
  }, [connId, table, selectedConnId, selectedTable, selectTable, gotoSchema]);

  // Hook actions → URL. Navigation is the single source of truth; the effects
  // above then drive the hook. `addConnection`/`removeConnection` perform their
  // backend mutation first, then route so the URL tracks the new selection.
  const cur = connId ?? db.selectedConnId ?? '';
  // TanStack encodes path params automatically — pass raw ids/names.
  const nav: DataBrowserState = {
    ...db,
    selectConn: (id) => navigate({ to: '/data/{-$connId}/{-$table}', params: { connId: id } }),
    backToSources: () => navigate({ to: '/data/{-$connId}/{-$table}', params: {} }),
    selectTable: (t) =>
      navigate({ to: '/data/{-$connId}/{-$table}', params: { connId: cur, table: t } }),
    gotoSchema: () => navigate({ to: '/data/{-$connId}/{-$table}', params: { connId: cur } }),
    addConnection: async (input) => {
      const created = await db.addConnection(input);
      navigate({ to: '/data/{-$connId}/{-$table}', params: { connId: created.id } });
      return created;
    },
    removeConnection: async (id) => {
      await db.removeConnection(id);
      if (id === connId) navigate({ to: '/data/{-$connId}/{-$table}', params: {} });
    },
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.logo}>
          <CubeMark />
        </span>
        <h1 className={styles.title}>{tr.dataBrowser.title}</h1>
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tab} ${nav.headerTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => nav.pickHeader(tab.key)}
          >
            {tr.dataBrowser.tabs[tab.label]}
          </button>
        ))}
      </div>

      {nav.headerTab === 'warehouse' ? (
        <div className={styles.body}>
          <div className={styles.left}>
            {nav.selectedConnId ? (
              <SchemaTree db={nav} />
            ) : (
              <SourceList db={nav} onAddConnection={() => setAddOpen(true)} />
            )}
          </div>
          <div className={styles.right}>
            <Detail db={nav} />
          </div>
        </div>
      ) : nav.headerTab === 'datamodels' ? (
        <div className={styles.right}>
          <DataModelsPanel db={nav} />
        </div>
      ) : (
        <Placeholder
          icon={nav.headerTab === 'recommended' ? 'dashboard' : 'tickCircle'}
          title={
            nav.headerTab === 'recommended'
              ? tr.dataBrowser.tabs.recommended
              : tr.dataBrowser.tabs.curation
          }
          subtitle={tr.common.nothingHere}
        />
      )}

      {addOpen ? (
        <AddConnectionDialog onClose={() => setAddOpen(false)} onSubmit={nav.addConnection} />
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
