import { Icon } from '../lib/icons';
import type { Thread } from '../types';

export function ThreadsList({
  threads,
  onOpenThread,
  onNewThread,
}: {
  threads: Thread[];
  onOpenThread: (id: string) => void;
  onNewThread: () => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '26px 32px 18px' }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'rgba(121,97,219,.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="threads" size={18} color="#7961db" />
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.3px', color: '#1c2127', flex: 1 }}>Threads</h1>
        <button
          className="btn-green"
          onClick={onNewThread}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 32,
            padding: '0 14px',
            border: 'none',
            borderRadius: 5,
            background: '#238551',
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Icon name="plus" size={13} color="#fff" />
          New thread
        </button>
      </div>

      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 16px', boxShadow: '0 1px 0 0 rgba(17,20,24,.1)' }}>
          <div style={{ flex: 1, ...colHead }}>Title</div>
          <div style={{ width: 180, ...colHead }}>Last Updated</div>
          <div style={{ width: 240, ...colHead }}>Creator</div>
        </div>

        {threads.map((t) => (
          <div
            key={t.id}
            className="list-row"
            onClick={() => onOpenThread(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              cursor: 'pointer',
              borderRadius: 5,
              boxShadow: 'inset 0 -1px 0 0 rgba(17,20,24,.06)',
            }}
          >
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, color: '#1c2127' }}>
              <Icon name="threads" size={15} color="#7961db" />
              {t.title}
            </div>
            <div style={{ width: 180, fontSize: 13, color: '#5f6b7c' }}>{t.updated}</div>
            <div style={{ width: 240, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#c87619',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {t.initial}
              </span>
              <span style={{ fontSize: 13, color: '#5f6b7c' }}>{t.creator}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const colHead = { fontSize: 12, fontWeight: 600, letterSpacing: '.2px', color: '#5f6b7c' } as const;
