import { useState } from 'react';
import { Icon } from '../lib/icons';

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
  { name: 'Exploration on Jun 23, 11:3…', icon: 'explorations', view: 'other', nav: 'explorations' },
  { name: 'Exploration on Jun 23, 11:5…', icon: 'explorations', view: 'other', nav: 'explorations' },
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
          className="nav-row"
          onClick={() => onNavigate(it.view, it.key, it.label)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            height: 32,
            padding: '0 9px',
            borderRadius: 6,
            cursor: 'pointer',
            background: active ? 'rgba(45,114,210,0.1)' : 'transparent',
          }}
        >
          <Icon name={it.key} size={15} color={active ? '#2d72d2' : '#5f6b7c'} />
          <span style={{ fontSize: 13.5, color: active ? '#215db0' : '#404854', fontWeight: active ? 600 : 500, flex: 1 }}>
            {it.label}
          </span>
          {it.beta ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '.2px',
                color: '#634dbf',
                background: 'rgba(121,97,219,.14)',
                borderRadius: 4,
                padding: '1px 5px',
              }}
            >
              Beta
            </span>
          ) : null}
        </div>
      );
    });

  const divider = <div style={{ height: 1, background: 'rgba(17,20,24,.08)', margin: '8px 9px' }} />;

  return (
    <div
      style={{
        width: 256,
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        boxShadow: '1px 0 0 0 rgba(17,20,24,.1)',
        minHeight: 0,
      }}
    >
      {/* workspace switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 8px' }}>
        <button
          className="ws-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 30,
            padding: '0 9px',
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            color: '#1c2127',
          }}
        >
          forFun
          <Icon name="caretDown" size={12} color="#8f99a8" />
        </button>
        <span style={{ flex: 1 }} />
        <button className="ws-btn ic" style={{ padding: 6, borderRadius: 5 }} title="Notifications">
          <Icon name="bell" size={16} color="#5f6b7c" />
        </button>
      </div>

      {/* quick create */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 10px' }}>
        <button
          className="btn-quick"
          onClick={() => onNavigate('notebook', 'projects', 'Projects')}
          style={quickBtn}
        >
          <Icon name="projects" size={13} color="#5f6b7c" />
          Project
        </button>
        <button className="btn-quick" onClick={onNewThread} style={quickBtn}>
          <Icon name="threads" size={13} color="#7961db" />
          Thread
        </button>
        <button
          className="btn-quick"
          onClick={onNewThread}
          style={{ ...quickBtn, width: 30, flex: 'none', padding: 0 }}
          title="New"
        >
          <Icon name="plus" size={14} color="#5f6b7c" />
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 8px' }}>
        <button
          className="btn-ghost"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 32,
            padding: '0 9px',
            border: 'none',
            borderRadius: 6,
            background: 'transparent',
            boxShadow: 'inset 0 0 0 1px rgba(17,20,24,.12)',
            cursor: 'pointer',
          }}
        >
          <Icon name="search" size={14} color="#8f99a8" />
          <span style={{ fontSize: 13, color: '#8f99a8', flex: 1, textAlign: 'left' }}>Search</span>
          <span style={{ fontSize: 11, color: '#abb3bf', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }}>
            ⌘K
          </span>
        </button>
      </div>

      {/* nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 8px' }}>
        {renderNav(NAV_TOP)}
        {divider}
        {renderNav(NAV_MID)}
        {divider}
        {renderNav(NAV_MAIN)}

        <div
          onClick={() => setRecentsOpen((o) => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '16px 9px 4px', cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: '#8f99a8' }}>RECENTS</span>
          <Icon
            name="chevronDown"
            size={11}
            color="#abb3bf"
            style={{ transform: `rotate(${recentsOpen ? 0 : -90}deg)`, transition: 'transform .1s' }}
          />
        </div>
        {recentsOpen ? (
          <div>
            {RECENTS.map((r, i) => (
              <div
                key={i}
                className="nav-row"
                onClick={() => (r.thread ? onNewThread() : onNavigate(r.view, r.nav, r.name))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, padding: '0 9px', borderRadius: 6, cursor: 'pointer' }}
              >
                <Icon name={r.icon} size={14} color="#8f99a8" />
                <span
                  style={{
                    fontSize: 13,
                    color: '#404854',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* bottom utilities */}
      <div style={{ flex: 'none', padding: 8, boxShadow: '0 -1px 0 0 rgba(17,20,24,.08)' }}>
        {[
          { icon: 'archive', label: 'Archive' },
          { icon: 'trash', label: 'Trash' },
          { icon: 'cog', label: 'Settings' },
        ].map((it) => (
          <div
            key={it.label}
            className="nav-row"
            style={{ display: 'flex', alignItems: 'center', gap: 11, height: 30, padding: '0 9px', borderRadius: 6, cursor: 'pointer' }}
          >
            <Icon name={it.icon} size={15} color="#5f6b7c" />
            <span style={{ fontSize: 13.5, color: '#404854', flex: 1 }}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const quickBtn = {
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: 30,
  border: 'none',
  borderRadius: 6,
  background: '#f1f3f6',
  boxShadow: 'inset 0 0 0 1px rgba(17,20,24,.08)',
  cursor: 'pointer',
  fontSize: 12.5,
  fontWeight: 500,
  color: '#404854',
} as const;
