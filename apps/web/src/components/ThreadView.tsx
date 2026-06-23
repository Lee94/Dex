import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import { isSqlResult, type AssistantMessage, type Thread, type ToolStep } from '../types';
import { Composer } from './Composer';
import { ResultCard } from './ResultCard';

const EXAMPLES = [
  'Top 5 products by revenue',
  'Monthly revenue trend this year',
  'Which customers have spent the most?',
];

export function ThreadView({
  thread,
  onBack,
  onSend,
}: {
  thread: Thread;
  onBack: () => void;
  onSend: (text: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.messages]);

  const streaming = thread.messages.some((m) => m.role === 'assistant' && m.status === 'streaming');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
      <Header title={thread.title} onBack={onBack} />

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ maxWidth: 840, margin: '0 auto', padding: '36px 24px 24px' }}>
          {thread.messages.length === 0 ? (
            <EmptyState onPick={onSend} />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
                color: '#abb3bf',
                marginBottom: 26,
              }}
            >
              <Icon name="bookmark" size={14} color="#c5cbd3" />
              <Icon name="more" size={14} color="#c5cbd3" />
            </div>
          )}

          {thread.messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 26, animation: 'fadeup .2s ease' }}>
                <div
                  style={{
                    background: '#edeff2',
                    color: '#1c2127',
                    fontSize: 14.5,
                    padding: '9px 15px',
                    borderRadius: 14,
                    maxWidth: '72%',
                  }}
                >
                  {m.text}
                </div>
              </div>
            ) : (
              <AssistantBlock key={m.id} msg={m} />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <Composer onSend={onSend} disabled={streaming} />
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div
      style={{
        height: 50,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '0 16px',
        boxShadow: '0 1px 0 0 rgba(17,20,24,.1)',
      }}
    >
      <button className="ic" style={{ padding: 5 }} title="Back" onClick={onBack}>
        <Icon name="menu" size={17} color="#404854" />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            background: '#2d72d2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="components" size={14} color="#fff" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-.2px', color: '#1c2127' }}>Dex</span>
      </div>
      <div style={{ width: 1, height: 20, background: 'rgba(17,20,24,.12)' }} />
      <span style={{ fontSize: 14, color: '#1c2127', fontWeight: 500 }}>{title}</span>
      <span style={{ flex: 1 }} />
      <button className="ic ic-soft" style={{ padding: 6 }} title="Translate">
        <Icon name="translate" size={16} color="#5f6b7c" />
      </button>
      <button className="ic ic-soft" style={{ padding: 6 }} title="Notebook view">
        <Icon name="notebook" size={16} color="#5f6b7c" />
      </button>
      <button
        className="btn-ghost"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 12px',
          border: 'none',
          borderRadius: 4,
          background: '#fff',
          boxShadow: 'inset 0 0 0 1px rgba(17,20,24,.18)',
          color: '#1c2127',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <Icon name="share" size={14} color="#5f6b7c" />
        Share
      </button>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0 8px', textAlign: 'center' }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: '#2d72d2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="components" size={24} color="#fff" />
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, color: '#1c2127' }}>Ask a question about your data</div>
      <div style={{ fontSize: 13.5, color: '#8f99a8', maxWidth: 420, lineHeight: 1.5 }}>
        Dex explores the warehouse — listing tables, inspecting schemas, and writing SQL — and shows its work as it goes.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            className="btn-quick"
            onClick={() => onPick(ex)}
            style={{
              border: 'none',
              borderRadius: 16,
              background: '#f1f3f6',
              boxShadow: 'inset 0 0 0 1px rgba(17,20,24,.08)',
              padding: '7px 13px',
              fontSize: 13,
              color: '#404854',
              cursor: 'pointer',
            }}
          >
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
    <div style={{ marginBottom: 26, animation: 'fadeup .2s ease' }}>
      {/* thinking toggle */}
      {(msg.steps.length > 0 || msg.status === 'streaming') && (
        <>
          <div
            onClick={() => setOpen((o) => !o)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              cursor: 'pointer',
              color: '#5f6b7c',
              marginBottom: open ? 16 : 18,
              userSelect: 'none',
            }}
          >
            <Icon
              name="chevronRight"
              size={13}
              color="#8f99a8"
              style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform .1s' }}
            />
            <span style={{ fontSize: 14, color: '#5f6b7c' }}>
              {msg.status === 'streaming' ? 'Working for ' : 'Worked for '}
              <ElapsedLabel startedAt={msg.startedAt} finishedAt={msg.finishedAt} />
            </span>
          </div>
          {open && (
            <div style={{ margin: '0 0 18px 20px', paddingLeft: 14, boxShadow: 'inset 1px 0 0 0 rgba(17,20,24,.1)' }}>
              {msg.steps.map((s) => (
                <StepRow key={s.toolCallId} step={s} />
              ))}
              {msg.status === 'streaming' && msg.steps.every((s) => s.status !== 'running') && (
                <StepRow
                  step={{ toolCallId: '_thinking', toolName: '', args: {}, status: 'running' }}
                  labelOverride="Thinking…"
                />
              )}
              {msg.reasoning ? (
                <div style={{ fontSize: 13, color: '#8f99a8', padding: '6px 0', whiteSpace: 'pre-wrap' }}>{msg.reasoning}</div>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* assistant answer text */}
      {msg.text ? (
        <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.6, color: '#1c2127', whiteSpace: 'pre-wrap' }}>{msg.text}</p>
      ) : null}

      {/* result cards (from run_sql) */}
      {cards.map((s) => (
        <ResultCard key={s.toolCallId} result={s.result} sql={typeof s.args.sql === 'string' ? s.args.sql : undefined} />
      ))}

      {/* error */}
      {msg.status === 'error' ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '10px 12px',
            borderRadius: 4,
            background: 'rgba(205,66,70,.1)',
            boxShadow: 'inset 0 0 0 1px rgba(205,66,70,.25)',
            color: '#ac2f33',
            fontSize: 13,
            marginTop: 4,
          }}
        >
          <Icon name="help" size={15} color="#cd4246" style={{ flex: 'none', marginTop: 1 }} />
          <span>
            {msg.errorText || 'Something went wrong.'}
            {/api key|401|unauthor/i.test(msg.errorText || '') ? ' — set ANTHROPIC_API_KEY in apps/agent/.env and restart the agent.' : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function StepRow({ step, labelOverride }: { step: ToolStep; labelOverride?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8f99a8', padding: '4px 0' }}>
      {step.status === 'running' ? (
        <Spinner />
      ) : step.status === 'error' ? (
        <Icon name="help" size={12} color="#cd4246" />
      ) : (
        <Icon name="tickCircle" size={12} color="#32a467" />
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
  return (
    <span
      style={{
        width: 11,
        height: 11,
        borderRadius: '50%',
        border: '2px solid rgba(95,107,124,.25)',
        borderTopColor: '#5f6b7c',
        display: 'inline-block',
        animation: 'spin .7s linear infinite',
      }}
    />
  );
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
