import { useState, type KeyboardEvent } from 'react';
import { Icon } from '@/lib/icons';
import { IconButton } from '@/components/ui';
import { ContextPicker } from '@/components/ContextPicker';
import { contextPrefix, type Attachment } from '@/lib/attachments';
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedKeys = new Set(attachments.map((a) => a.key));

  const toggleAttachment = (a: Attachment) => {
    setAttachments((prev) =>
      prev.some((x) => x.key === a.key) ? prev.filter((x) => x.key !== a.key) : [...prev, a],
    );
  };
  const removeAttachment = (key: string) =>
    setAttachments((prev) => prev.filter((a) => a.key !== key));

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    const message = contextPrefix(attachments) + text;
    setValue('');
    setAttachments([]);
    onSend(message);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const iconFor = (a: Attachment) =>
    a.kind === 'model' ? 'layers' : a.kind === 'table' ? 'table' : 'data';

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        {attachments.length > 0 ? (
          <div className={styles.chips}>
            {attachments.map((a) => (
              <span key={a.key} className={styles.chip}>
                <Icon name={iconFor(a)} size={12} color="var(--dex-accent)" />
                {a.label}
                <button
                  type="button"
                  className={styles.chipRemove}
                  title="Remove"
                  onClick={() => removeAttachment(a.key)}
                >
                  <Icon name="cross" size={10} color="var(--dex-icon-subtle)" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask a question…"
          className={styles.textarea}
        />
        <div className={styles.toolbar}>
          <div className={styles.attachWrap}>
            <button
              type="button"
              className={`${styles.attach} ${pickerOpen ? styles.attachActive : ''}`}
              title="Add data context"
              onClick={() => setPickerOpen((o) => !o)}
            >
              <Icon name="plus" size={14} color="var(--dex-icon)" />
            </button>
            {pickerOpen ? (
              <ContextPicker
                selected={selectedKeys}
                onToggle={toggleAttachment}
                onClose={() => setPickerOpen(false)}
              />
            ) : null}
          </div>
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
