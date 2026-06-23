import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton, Button, Pill } from '@/components/ui';
import styles from './Sidebar.module.css';

export type View = 'threads' | 'thread' | 'notebook' | 'other';

type NavItem = { key: string; label: string; view: View; beta?: boolean };

const NAV_TOP: NavItem[] = [
  { key: 'home', label: 'Home', view: 'other' },
  { key: 'applications', label: 'Context Studio', view: 'other' },
];
const NAV_MID: NavItem[] = [
  { key: 'tasks', label: 'Tasks', view: 'other' },
  { key: 'collections', label: 'Collections', view: 'other' },
  { key: 'library', label: 'Library', view: 'other' },
];
const NAV_MAIN: NavItem[] = [
  { key: 'threads', label: 'Threads', view: 'threads', beta: true },
  { key: 'projects', label: 'Projects', view: 'notebook' },
  { key: 'components', label: 'Components', view: 'other' },
  { key: 'explorations', label: 'Explorations', view: 'other' },
  { key: 'data', label: 'Data', view: 'other' },
];

type Recent = { name: string; icon: string; thread?: boolean; view: View; nav: string };
const RECENTS: Recent[] = [
  { name: 'Bar chart data', icon: 'threads', thread: true, view: 'thread', nav: 'threads' },
  { name: '[Demo] Sales Revenue Dash…', icon: 'dashboard', view: 'notebook', nav: 'projects' },
  { name: 'Behavioral customer segme…', icon: 'projects', view: 'other', nav: 'projects' },
  {
    name: 'Exploration on Jun 23, 11:3…',
    icon: 'explorations',
    view: 'other',
    nav: 'explorations',
  },
  {
    name: 'Exploration on Jun 23, 11:5…',
    icon: 'explorations',
    view: 'other',
    nav: 'explorations',
  },
];

export function Sidebar({
  nav,
  onNavigate,
  onNewThread,
}: {
  nav: string;
  onNavigate: (view: View, navKey: string, title: string) => void;
  onNewThread: () => void;
}) {
  const [recentsOpen, setRecentsOpen] = useState(true);

  const renderNav = (items: NavItem[]) =>
    items.map((it) => {
      const active = it.key === nav;
      return (
        <div
          key={it.key}
          className={`${styles.navRow} ${active ? styles.navRowActive : ''}`}
          onClick={() => onNavigate(it.view, it.key, it.label)}
        >
          <Icon name={it.key} size={15} color={active ? 'var(--dex-primary)' : 'var(--dex-icon)'} />
          <span className={`${styles.navLabel} ${active ? styles.navLabelActive : ''}`}>
            {it.label}
          </span>
          {it.beta ? <Pill tone="beta">Beta</Pill> : null}
        </div>
      );
    });

  const divider = <div className={styles.divider} />;

  return (
    <div className={styles.sidebar}>
      {/* workspace switcher */}
      <div className={styles.workspace}>
        <button className={styles.wsBtn}>
          forFun
          <Icon name="caretDown" size={12} color="var(--dex-icon-subtle)" />
        </button>
        <span className={styles.spacer} />
        <IconButton
          icon="bell"
          size={16}
          color="var(--dex-icon)"
          title="Notifications"
          hover="soft"
          padding={6}
        />
      </div>

      {/* quick create */}
      <div className={styles.quickRow}>
        <Button
          variant="quick"
          onClick={() => onNavigate('notebook', 'projects', 'Projects')}
          style={{ flex: 1 }}
        >
          <Icon name="projects" size={13} color="var(--dex-icon)" />
          Project
        </Button>
        <Button variant="quick" onClick={onNewThread} style={{ flex: 1 }}>
          <Icon name="threads" size={13} color="var(--dex-accent)" />
          Thread
        </Button>
        <Button
          variant="quick"
          onClick={onNewThread}
          style={{ width: 30, flex: 'none', padding: 0 }}
          title="New"
        >
          <Icon name="plus" size={14} color="var(--dex-icon)" />
        </Button>
      </div>

      {/* search */}
      <div className={styles.searchRow}>
        <button className={styles.search}>
          <Icon name="search" size={14} color="var(--dex-icon-subtle)" />
          <span className={styles.searchLabel}>Search</span>
          <span className={styles.searchKbd}>⌘K</span>
        </button>
      </div>

      {/* nav */}
      <div className={styles.nav}>
        {renderNav(NAV_TOP)}
        {divider}
        {renderNav(NAV_MID)}
        {divider}
        {renderNav(NAV_MAIN)}

        <div className={styles.recentsHeader} onClick={() => setRecentsOpen((o) => !o)}>
          <span className={styles.recentsTitle}>RECENTS</span>
          <Icon
            name="chevronDown"
            size={11}
            color="var(--dex-text-faint)"
            style={{
              transform: `rotate(${recentsOpen ? 0 : -90}deg)`,
              transition: 'transform .1s',
            }}
          />
        </div>
        {recentsOpen ? (
          <div>
            {RECENTS.map((r, i) => (
              <div
                key={i}
                className={styles.recentRow}
                onClick={() => (r.thread ? onNewThread() : onNavigate(r.view, r.nav, r.name))}
              >
                <Icon name={r.icon} size={14} color="var(--dex-icon-subtle)" />
                <span className={styles.recentLabel}>{r.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* bottom utilities */}
      <div className={styles.bottom}>
        {[
          { icon: 'archive', label: 'Archive' },
          { icon: 'trash', label: 'Trash' },
          { icon: 'cog', label: 'Settings' },
        ].map((it) => (
          <div key={it.label} className={styles.bottomRow}>
            <Icon name={it.icon} size={15} color="var(--dex-icon)" />
            <span className={styles.bottomLabel}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
