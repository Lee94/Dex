import { useState, type KeyboardEvent } from 'react';
import { IconButton } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { useT } from '@/i18n';
import { useModelAssistant, type CubeProposal } from '@/hooks/useModelAssistant';
import styles from '../dataBrowser.module.css';

/**
 * The editor's right pane: a lightweight chat with the `semanticModel` agent.
 * Its `propose_cube` results flow into the editor via `onProposal` (which drops
 * the YAML into the YAML tab). Empty state offers suggestion chips.
 */
export function ModelAssistantPanel({ onProposal }: { onProposal: (p: CubeProposal) => void }) {
  const t = useT();
  const { messages, streaming, error, send, stop } = useModelAssistant({ onProposal });
  const [input, setInput] = useState('');

  const submit = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void send(text);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const suggestions = [
    t.modelEditor.suggestions.fromTable,
    t.modelEditor.suggestions.addMembers,
    t.modelEditor.suggestions.revenue,
  ];

  return (
    <div className={styles.meAgentCol}>
      <div className={styles.meChatScroll}>
        {messages.length === 0 ? (
          <div className={styles.meChatEmpty}>
            <div className={styles.meChatTitle}>{t.modelEditor.assistantTitle}</div>
            <div className={styles.meChatSub}>{t.modelEditor.assistantSubtitle}</div>
            <div className={styles.meChips}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.meChip}
                  disabled={streaming}
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className={`${styles.meMsg} ${styles.meMsgUser}`}>
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={`${styles.meMsg} ${styles.meMsgAssistant}`}>
                {m.text ? (
                  <Markdown source={m.text} />
                ) : (
                  <span className={styles.emptyHint}>{t.modelEditor.thinking}</span>
                )}
              </div>
            ),
          )
        )}
        {error ? <div className={styles.meChatError}>{error}</div> : null}
      </div>

      <div className={styles.meComposer}>
        <div className={styles.meComposerBar}>
          <textarea
            className={styles.meComposerInput}
            rows={1}
            value={input}
            placeholder={t.modelEditor.assistantPlaceholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
          />
          {streaming ? (
            <IconButton icon="cross" size={14} title={t.modelEditor.stop} onClick={stop} />
          ) : (
            <IconButton
              icon="send"
              size={15}
              color="var(--dex-primary)"
              title={t.modelEditor.assistantPlaceholder}
              disabled={!input.trim()}
              onClick={submit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
