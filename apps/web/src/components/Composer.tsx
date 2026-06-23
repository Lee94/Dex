import { useState, type KeyboardEvent } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton } from '@/components/ui';
import styles from './Composer.module.css';

export function Composer({
  onSend,
  onStop,
  streaming,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const [value, setValue] = useState('');

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
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
    <div className={styles.root}>
      <div className={styles.bar}>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask a question…"
          className={styles.textarea}
        />
        <div className={styles.toolbar}>
          <button className={styles.attach} title="Attach">
            <Icon name="plus" size={14} color="var(--dex-icon)" />
          </button>
          <span className={styles.spacer} />
          <IconButton
            icon="cog"
            size={15}
            color="var(--dex-text-subtle)"
            title="Settings"
            hover="mid"
            padding={6}
          />
          <button className={styles.auto}>
            Auto
            <Icon name="caretDown" size={12} color="var(--dex-text-subtle)" />
          </button>
          {streaming ? (
            <button className={styles.stop} onClick={onStop} title="Stop">
              <span className={styles.stopGlyph} />
            </button>
          ) : (
            <button className={styles.send} onClick={submit} disabled={!value.trim()} title="Send">
              <Icon name="send" size={13} color="#fff" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
