import { useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '@/lib/icons';
import { IconButton } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { useT } from '@/i18n';
import { llmErrorMessage } from '@/lib/llmError';
import { useModelAssistant } from '@/hooks/useModelAssistant';
import styles from './modelStudio.module.css';

/**
 * The studio's right pane: a chat with the `semanticModel` agent. Its
 * `propose_cube` results flow into the active editor tab via `onProposal`. The
 * empty state mirrors the Hex agent panel (suggestion rows + composer).
 */
export function StudioAgentPanel({
  onClose,
  onProposal,
}: {
  onClose: () => void;
  onProposal: (yaml: string) => void;
}) {
  const t = useT();
  const { messages, streaming, error, send, stop, reset } = useModelAssistant({
    onProposal: (p) => onProposal(p.yaml),
  });
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

  const actions: { icon: IconName; label: string }[] = [
    { icon: 'plus', label: t.modelStudio.agentActions.createModels },
    { icon: 'link', label: t.modelStudio.agentActions.createJoins },
    { icon: 'sigma', label: t.modelStudio.agentActions.addMembers },
    { icon: 'data', label: t.modelStudio.agentActions.fromProjects },
  ];

  return (
    <aside className={styles.agentCol}>
      <header className={styles.agentHead}>
        <span className={styles.agentTitle}>{t.modelStudio.agent}</span>
        <div className={styles.agentHeadActions}>
          <IconButton
            icon="plus"
            size={15}
            color="var(--dex-icon)"
            title={t.modelStudio.newChat}
            onClick={reset}
          />
          <IconButton
            icon="cross"
            size={14}
            color="var(--dex-icon)"
            title={t.modelStudio.hidePanel}
            onClick={onClose}
          />
        </div>
      </header>

      <div className={styles.agentScroll}>
        {messages.length === 0 ? (
          <div className={styles.agentEmpty}>
            <div className={styles.agentGlyph} aria-hidden="true">
              <Icon name="notebook" size={30} color="var(--dex-icon-faint)" />
            </div>
            <div className={styles.agentEmptyTitle}>{t.modelEditor.assistantTitle}</div>
            <div className={styles.agentEmptySub}>{t.modelStudio.agentSub}</div>
            <div className={styles.agentTry}>{t.modelStudio.tryAsking}</div>
            <div className={styles.agentActions}>
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className={styles.agentAction}
                  disabled={streaming}
                  onClick={() => void send(a.label)}
                >
                  <Icon name={a.icon} size={14} color="var(--dex-icon)" />
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className={`${styles.msg} ${styles.msgUser}`}>
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={`${styles.msg} ${styles.msgAssistant}`}>
                {m.text ? (
                  <Markdown source={m.text} />
                ) : (
                  <span className={styles.thinking}>{t.modelEditor.thinking}</span>
                )}
              </div>
            ),
          )
        )}
        {error ? <div className={styles.agentError}>{llmErrorMessage(error, t)}</div> : null}
      </div>

      <div className={styles.composer}>
        <div className={styles.composerBar}>
          <textarea
            className={styles.composerInput}
            rows={1}
            value={input}
            placeholder={t.modelStudio.agentPlaceholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
          />
          <div className={styles.composerFoot}>
            <span className={styles.autoChip}>
              {t.modelStudio.auto}
              <Icon name="chevronDown" size={11} color="var(--dex-icon-subtle)" />
            </span>
            {streaming ? (
              <IconButton icon="cross" size={14} title={t.modelEditor.stop} onClick={stop} />
            ) : (
              <IconButton
                icon="send"
                size={15}
                color="var(--dex-primary)"
                title={t.modelStudio.agentPlaceholder}
                disabled={!input.trim()}
                onClick={submit}
              />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
