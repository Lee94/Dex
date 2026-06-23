import { Icon } from '../lib/icons';

/** Blueprint-style NonIdealState used for the not-yet-built views. */
export function Placeholder({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f6f7f9',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 12,
          background: '#edeff2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={26} color="#abb3bf" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#5f6b7c' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#8f99a8' }}>{subtitle}</div>
    </div>
  );
}
