import { useState, type KeyboardEvent } from 'react';
import { Icon } from '../lib/icons';

export function Composer({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('');

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue('');
    onSend(text);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div style={{ flex: 'none', padding: '0 24px 22px' }}>
      <div
        style={{
          maxWidth: 840,
          margin: '0 auto',
          borderRadius: 12,
          background: '#fff',
          boxShadow: '0 0 0 1px rgba(17,20,24,.15),0 2px 8px -2px rgba(0,0,0,.08)',
          padding: '14px 16px 10px',
        }}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask a question…"
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 15,
            color: '#1c2127',
            lineHeight: 1.5,
            minHeight: 24,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button
            className="btn-ghost"
            style={{
              width: 28,
              height: 28,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              boxShadow: 'inset 0 0 0 1px rgba(17,20,24,.15)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Attach"
          >
            <Icon name="plus" size={14} color="#5f6b7c" />
          </button>
          <span style={{ flex: 1 }} />
          <button className="ic ic-soft" style={{ padding: 6 }} title="Settings">
            <Icon name="cog" size={15} color="#8f99a8" />
          </button>
          <button
            className="btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 28,
              padding: '0 9px',
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              boxShadow: 'inset 0 0 0 1px rgba(17,20,24,.15)',
              color: '#404854',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Auto
            <Icon name="caretDown" size={12} color="#8f99a8" />
          </button>
          <button
            className="btn-send"
            onClick={submit}
            disabled={disabled}
            style={{
              width: 28,
              height: 28,
              border: 'none',
              borderRadius: 6,
              background: '#2d72d2',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.55 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Send"
          >
            <Icon name="send" size={13} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  );
}
