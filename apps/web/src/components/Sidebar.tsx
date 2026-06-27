import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { Icon } from '@/lib/icons';
import { IconButton, Button, Pill } from '@/components/ui';
import { useThreadsContext } from '@/contexts/ThreadsContext';
import styles from './Sidebar.module.css';

// How many recent threads to surface in the sidebar.
const MAX_RECENTS = 8;

type NavItem = { key: string; label: string; path: string; beta?: boolean };

const NAV_TOP: NavItem[] = [
  { key: 'home', label: 'Home', path: '/home' },
  { key: 'applications', label: 'Context Studio', path: '/applications' },
];
const NAV_MID: NavItem[] = [
  { key: 'tasks', label: 'Tasks', path: '/tasks' },
  { key: 'collections', label: 'Collections', path: '/collections' },
  { key: 'library', label: 'Knowledge', path: '/knowledge' },
];
const NAV_MAIN: NavItem[] = [
  { key: 'threads', label: 'Threads', path: '/threads', beta: true },
  { key: 'projects', label: 'Projects', path: '/notebooks' },
  { key: 'components', label: 'Components', path: '/components' },
  { key: 'explorations', label: 'Explorations', path: '/explorations' },
  { key: 'data', label: 'Data', path: '/data' },
];

export function Sidebar() {
  const { threads, createThread } = useThreadsContext();
  const navigate = useNavigate();
  const [recentsOpen, setRecentsOpen] = useState(true);
  const recents = threads.slice(0, MAX_RECENTS);

  const newThread = () => navigate(`/threads/${createThread()}`);

  // Nav rows are links now — active state comes from the URL via NavLink.
  const renderNav = (items: NavItem[]) =>
    items.map((it) => (
      <NavLink
        key={it.key}
        to={it.path}
        className={({ isActive }) => `${styles.navRow} ${isActive ? styles.navRowActive : ''}`}
      >
        {({ isActive }) => (
          <>
            <Icon
              name={it.key}
              size={15}
              color={isActive ? 'var(--dex-primary)' : 'var(--dex-icon)'}
            />
            <span className={`${styles.navLabel} ${isActive ? styles.navLabelActive : ''}`}>
              {it.label}
            </span>
            {it.beta ? <Pill tone="beta">Beta</Pill> : null}
          </>
        )}
      </NavLink>
    ));

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
        <Button variant="quick" onClick={() => navigate('/notebooks')} style={{ flex: 1 }}>
          <Icon name="projects" size={13} color="var(--dex-icon)" />
          Project
        </Button>
        <Button variant="quick" onClick={newThread} style={{ flex: 1 }}>
          <Icon name="threads" size={13} color="var(--dex-accent)" />
          Thread
        </Button>
        <Button
          variant="quick"
          onClick={newThread}
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
            {recents.length === 0 ? (
              <div className={styles.recentsEmpty}>No threads yet</div>
            ) : (
              recents.map((t) => (
                <NavLink key={t.id} to={`/threads/${t.id}`} className={styles.recentRow}>
                  <Icon name="threads" size={14} color="var(--dex-icon-subtle)" />
                  <span className={styles.recentLabel}>{t.title}</span>
                </NavLink>
              ))
            )}
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
