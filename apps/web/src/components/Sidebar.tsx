import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Icon } from '@/lib/icons';
import { IconButton, Button, Pill } from '@/components/ui';
import { useThreadsContext } from '@/contexts/ThreadsContext';
import { useT, useLocale, LOCALES, type Dict } from '@/i18n';
import styles from './Sidebar.module.css';

// How many recent threads to surface in the sidebar.
const MAX_RECENTS = 8;

// `label` keys into `t.sidebar.nav`; `key` is the icon name (which can differ,
// e.g. the "applications" icon labels "Context Studio"). `path` is a typed route
// target checked against the router; the Data item carries TanStack's optional-param
// template so it resolves to the `/data` drill-down route.
type NavPath =
  | '/home'
  | '/applications'
  | '/tasks'
  | '/collections'
  | '/knowledge'
  | '/threads'
  | '/projects'
  | '/components'
  | '/explorations'
  | '/data/{-$connId}/{-$table}';
type NavItem = { key: string; label: keyof Dict['sidebar']['nav']; path: NavPath; beta?: boolean };

const NAV_TOP: NavItem[] = [
  { key: 'home', label: 'home', path: '/home' },
  { key: 'applications', label: 'contextStudio', path: '/applications' },
];
const NAV_MID: NavItem[] = [
  { key: 'tasks', label: 'tasks', path: '/tasks' },
  { key: 'collections', label: 'collections', path: '/collections' },
  { key: 'library', label: 'knowledge', path: '/knowledge' },
];
const NAV_MAIN: NavItem[] = [
  { key: 'threads', label: 'threads', path: '/threads', beta: true },
  { key: 'projects', label: 'projects', path: '/projects' },
  { key: 'components', label: 'components', path: '/components' },
  { key: 'explorations', label: 'explorations', path: '/explorations' },
  { key: 'data', label: 'data', path: '/data/{-$connId}/{-$table}' },
];

export function Sidebar() {
  const { threads, createThread } = useThreadsContext();
  const t = useT();
  const navigate = useNavigate();
  const [recentsOpen, setRecentsOpen] = useState(true);
  const recents = threads.slice(0, MAX_RECENTS);

  const newThread = () => navigate({ to: '/threads/$id', params: { id: createThread() } });

  // Nav rows are links — active state comes from the URL via TanStack's Link
  // (base className always applied; `activeProps` merges the active class on match).
  const renderNav = (items: NavItem[]) =>
    items.map((it) => (
      <Link
        key={it.key}
        to={it.path}
        className={styles.navRow}
        activeProps={{ className: styles.navRowActive }}
      >
        {({ isActive }) => (
          <>
            <Icon
              name={it.key}
              size={15}
              color={isActive ? 'var(--dex-primary)' : 'var(--dex-icon)'}
            />
            <span className={`${styles.navLabel} ${isActive ? styles.navLabelActive : ''}`}>
              {t.sidebar.nav[it.label]}
            </span>
            {it.beta ? <Pill tone="beta">{t.sidebar.beta}</Pill> : null}
          </>
        )}
      </Link>
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
          title={t.sidebar.notifications}
          hover="soft"
          padding={6}
        />
      </div>

      {/* quick create */}
      <div className={styles.quickRow}>
        <Button variant="quick" onClick={() => navigate({ to: '/projects' })} style={{ flex: 1 }}>
          <Icon name="projects" size={13} color="var(--dex-icon)" />
          {t.sidebar.project}
        </Button>
        <Button variant="quick" onClick={newThread} style={{ flex: 1 }}>
          <Icon name="threads" size={13} color="var(--dex-accent)" />
          {t.sidebar.thread}
        </Button>
        <Button
          variant="quick"
          onClick={newThread}
          style={{ width: 30, flex: 'none', padding: 0 }}
          title={t.sidebar.new}
        >
          <Icon name="plus" size={14} color="var(--dex-icon)" />
        </Button>
      </div>

      {/* search */}
      <div className={styles.searchRow}>
        <button className={styles.search}>
          <Icon name="search" size={14} color="var(--dex-icon-subtle)" />
          <span className={styles.searchLabel}>{t.sidebar.search}</span>
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
          <span className={styles.recentsTitle}>{t.sidebar.recents}</span>
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
              <div className={styles.recentsEmpty}>{t.sidebar.noThreads}</div>
            ) : (
              recents.map((thr) => (
                <Link
                  key={thr.id}
                  to="/threads/$id"
                  params={{ id: thr.id }}
                  className={styles.recentRow}
                >
                  <Icon name="threads" size={14} color="var(--dex-icon-subtle)" />
                  <span className={styles.recentLabel}>{thr.title}</span>
                </Link>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* bottom utilities */}
      <div className={styles.bottom}>
        <LanguageSwitcher />
        {[
          { icon: 'archive', label: t.sidebar.archive },
          { icon: 'trash', label: t.sidebar.trash },
          { icon: 'cog', label: t.sidebar.settings },
        ].map((it) => (
          <div key={it.icon} className={styles.bottomRow}>
            <Icon name={it.icon} size={15} color="var(--dex-icon)" />
            <span className={styles.bottomLabel}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Language picker in the sidebar's bottom utilities — opens a small popover of
 *  the available locales, persisting the choice (see i18n store). */
function LanguageSwitcher() {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const [open, setOpen] = useState(false);
  const current = LOCALES.find((l) => l.code === locale)?.nativeLabel ?? locale;

  return (
    <div className={styles.langWrap}>
      <div className={styles.bottomRow} onClick={() => setOpen((o) => !o)}>
        <Icon name="translate" size={15} color="var(--dex-icon)" />
        <span className={styles.bottomLabel}>{t.language.label}</span>
        <span className={styles.langCurrent}>{current}</span>
      </div>
      {open ? (
        <>
          <div className={styles.langBackdrop} onClick={() => setOpen(false)} />
          <div className={styles.langMenu}>
            {LOCALES.map((l) => (
              <button
                key={l.code}
                type="button"
                className={styles.langItem}
                onClick={() => {
                  setLocale(l.code);
                  setOpen(false);
                }}
              >
                <span className={styles.langItemLabel}>{l.nativeLabel}</span>
                {l.code === locale ? (
                  <Icon name="tickCircle" size={13} color="var(--dex-success-check)" />
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
