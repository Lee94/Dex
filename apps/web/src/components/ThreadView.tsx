import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import { isSqlResult, type AssistantMessage, type Thread, type ToolStep } from '@/types';
import { Composer } from '@/components/Composer';
import { ResultCard } from '@/components/ResultCard';
import styles from './ThreadView.module.css';

const EXAMPLES = [
  'Top 5 products by revenue',
  'Monthly revenue trend this year',
  'Which customers have spent the most?',
];

export function ThreadView({
  thread,
  onBack,
  onSend,
  onStop,
}: {
  thread: Thread;
  onBack: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.messages]);

  const streaming = thread.messages.some((m) => m.role === 'assistant' && m.status === 'streaming');

  return (
    <div className={styles.root}>
      <Header title={thread.title} onBack={onBack} />

      <div ref={scrollRef} className={styles.scroll}>
        <div className={styles.page}>
          {thread.messages.length === 0 ? (
            <EmptyState onPick={onSend} />
          ) : (
            <div className={styles.dividerIcons}>
              <Icon name="bookmark" size={14} color="var(--dex-text-faintest)" />
              <Icon name="more" size={14} color="var(--dex-text-faintest)" />
            </div>
          )}

          {thread.messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className={styles.userRow}>
                <div className={styles.userBubble}>{m.text}</div>
              </div>
            ) : (
              <AssistantBlock key={m.id} msg={m} />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <Composer onSend={onSend} onStop={onStop} streaming={streaming} />
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className={styles.header}>
      <IconButton
        icon="menu"
        size={17}
        color="var(--dex-text-strong)"
        title="Back"
        onClick={onBack}
        hover="strong"
      />
      <div className={styles.brand}>
        <div className={styles.brandMark}>
          <Icon name="components" size={14} color="#fff" />
        </div>
        <span className={styles.brandName}>Dex</span>
      </div>
      <div className={styles.headerDivider} />
      <span className={styles.headerTitle}>{title}</span>
      <span className={styles.headerSpacer} />
      <IconButton
        icon="translate"
        size={16}
        color="var(--dex-icon)"
        title="Translate"
        hover="mid"
        padding={6}
      />
      <IconButton
        icon="notebook"
        size={16}
        color="var(--dex-icon)"
        title="Notebook view"
        hover="mid"
        padding={6}
      />
      <Button variant="ghost">
        <Icon name="share" size={14} color="var(--dex-icon)" />
        Share
      </Button>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMark}>
        <Icon name="components" size={24} color="#fff" />
      </div>
      <div className={styles.emptyTitle}>Ask a question about your data</div>
      <div className={styles.emptyBody}>
        Dex explores the warehouse — listing tables, inspecting schemas, and writing SQL — and shows
        its work as it goes.
      </div>
      <div className={styles.examples}>
        {EXAMPLES.map((ex) => (
          <button key={ex} className={styles.exampleChip} onClick={() => onPick(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantBlock({ msg }: { msg: AssistantMessage }) {
  const [open, setOpen] = useState(true);
  const cards = msg.steps.filter((s) => isSqlResult(s.result));

  return (
    <div className={styles.assistant}>
      {/* thinking toggle */}
      {(msg.steps.length > 0 || msg.status === 'streaming') && (
        <>
          <div
            onClick={() => setOpen((o) => !o)}
            className={styles.thinkingToggle}
            style={{ marginBottom: open ? 16 : 18 }}
          >
            <Icon
              name="chevronRight"
              size={13}
              color="var(--dex-text-subtle)"
              style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform .1s' }}
            />
            <span className={styles.thinkingToggleLabel}>
              {msg.status === 'streaming' ? 'Working for ' : 'Worked for '}
              <ElapsedLabel startedAt={msg.startedAt} finishedAt={msg.finishedAt} />
            </span>
          </div>
          {open && (
            <div className={styles.steps}>
              {msg.steps.map((s) => (
                <StepRow key={s.toolCallId} step={s} />
              ))}
              {msg.status === 'streaming' && msg.steps.every((s) => s.status !== 'running') && (
                <StepRow
                  step={{ toolCallId: '_thinking', toolName: '', args: {}, status: 'running' }}
                  labelOverride="Thinking…"
                />
              )}
              {msg.reasoning ? <div className={styles.reasoning}>{msg.reasoning}</div> : null}
            </div>
          )}
        </>
      )}

      {/* assistant answer text */}
      {msg.text ? <p className={styles.answerText}>{msg.text}</p> : null}

      {/* result cards (from run_sql) */}
      {cards.map((s) => (
        <ResultCard
          key={s.toolCallId}
          result={s.result}
          sql={typeof s.args.sql === 'string' ? s.args.sql : undefined}
        />
      ))}

      {/* error */}
      {msg.status === 'error' ? (
        <div className={styles.error}>
          <Icon
            name="help"
            size={15}
            color="var(--dex-danger)"
            style={{ flex: 'none', marginTop: 1 }}
          />
          <span>
            {msg.errorText || 'Something went wrong.'}
            {/api key|401|unauthor/i.test(msg.errorText || '')
              ? ' — set ANTHROPIC_API_KEY in apps/agent/.env and restart the agent.'
              : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function StepRow({ step, labelOverride }: { step: ToolStep; labelOverride?: string }) {
  return (
    <div className={styles.step}>
      {step.status === 'running' ? (
        <Spinner />
      ) : step.status === 'error' ? (
        <Icon name="help" size={12} color="var(--dex-danger)" />
      ) : (
        <Icon name="tickCircle" size={12} color="var(--dex-success-check)" />
      )}
      <span>{labelOverride ?? stepLabel(step)}</span>
    </div>
  );
}

function stepLabel(step: ToolStep): string {
  const args = step.args || {};
  if (typeof args.sql === 'string') return 'Ran a SQL query';
  if (typeof args.table === 'string') return `Inspected ${args.table}`;
  if (/list/i.test(step.toolName)) return 'Listed available tables';
  return step.toolName || 'Working';
}

function Spinner() {
  return <span className={styles.spinner} />;
}

function ElapsedLabel({ startedAt, finishedAt }: { startedAt: number; finishedAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (finishedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [finishedAt]);
  const end = finishedAt ?? now;
  const secs = Math.max(0, Math.round((end - startedAt) / 1000));
  return <>{formatDuration(secs)}</>;
}

function formatDuration(s: number): string {
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} minute${m === 1 ? '' : 's'} ${r} second${r === 1 ? '' : 's'}`;
}
