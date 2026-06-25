import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import {
  isSqlResult,
  resultProvenance,
  type AssistantMessage,
  type ChartHint,
  type Thread,
  type ToolStep,
} from '@/types';
import { Composer } from '@/components/Composer';
import { Markdown } from '@/components/Markdown';
import { ResultCard } from '@/components/ResultCard';
import { splitUserMessage } from '@/lib/attachments';
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
  onRetryLoad,
  onOpenNotebook,
}: {
  thread: Thread;
  onBack: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetryLoad: () => void;
  onOpenNotebook: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.messages]);

  const streaming = thread.messages.some((m) => m.role === 'assistant' && m.status === 'streaming');
  const empty = thread.messages.length === 0;
  const loading = empty && thread.loadingMessages;
  const loadError = empty && !thread.loadingMessages ? thread.loadError : undefined;

  return (
    <div className={styles.root}>
      <Header title={thread.title} onBack={onBack} onOpenNotebook={onOpenNotebook} />

      <div ref={scrollRef} className={styles.scroll}>
        <div className={styles.page}>
          {loading ? (
            <LoadingConversation />
          ) : loadError ? (
            <LoadError message={loadError} onRetry={onRetryLoad} />
          ) : empty ? (
            <EmptyState onPick={onSend} />
          ) : (
            <div className={styles.dividerIcons}>
              <Icon name="bookmark" size={14} color="var(--dex-text-faintest)" />
              <Icon name="more" size={14} color="var(--dex-text-faintest)" />
            </div>
          )}

          {thread.messages.map((m) =>
            m.role === 'user' ? (
              <UserRow key={m.id} text={m.text} />
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

function Header({
  title,
  onBack,
  onOpenNotebook,
}: {
  title: string;
  onBack: () => void;
  onOpenNotebook: () => void;
}) {
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
        title="Open as notebook"
        hover="mid"
        padding={6}
        onClick={onOpenNotebook}
      />
      <Button variant="ghost">
        <Icon name="share" size={14} color="var(--dex-icon)" />
        Share
      </Button>
    </div>
  );
}

function LoadingConversation() {
  return (
    <div className={styles.loadState}>
      <span className={styles.loadSpinner} />
      <span className={styles.loadText}>Loading conversation…</span>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.loadState}>
      <Icon name="help" size={22} color="var(--dex-danger)" />
      <div className={styles.loadText}>Couldn’t load this conversation.</div>
      <div className={styles.loadSubtext}>{message}</div>
      <Button variant="ghost" onClick={onRetry} style={{ marginTop: 4 }}>
        Retry
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

// The agent references a cell with a bracketed tag whose prefix varies in
// practice ([cell:<id>], [c:<id>], or just [<id>]). Match any bracketed token,
// then pull out the id (the part after a ':' if present). It's an embed only
// when that id is a real authored cell, so ordinary [text](link) markdown and
// other brackets stay literal.
const CELL_TAG = /\[([^\]\n]{6,})\]/g;

function cellRefId(bracketContent: string, cellById: Map<string, ToolStep>): string | undefined {
  const raw = bracketContent.trim();
  const candidate = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1).trim() : raw;
  return cellById.has(candidate) ? candidate : undefined;
}

/** Read a `create_sql_cell` result's cellId, if this step is one. */
function cellIdOf(result: unknown): string | undefined {
  if (typeof result === 'object' && result !== null) {
    const id = (result as { cellId?: unknown }).cellId;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

/** A `chart` hint the agent attached to create_sql_cell (or echoed on the result). */
function chartHint(step: ToolStep): ChartHint | undefined {
  const fromArgs = step.args.chart;
  const fromResult =
    typeof step.result === 'object' && step.result !== null
      ? (step.result as { chart?: unknown }).chart
      : undefined;
  const raw = fromArgs ?? fromResult;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const h = raw as Record<string, unknown>;
  const type = h.type;
  const ok = type === 'table' || type === 'bar' || type === 'line' || type === 'area';
  return {
    type: ok ? (type as ChartHint['type']) : undefined,
    x: typeof h.x === 'string' ? h.x : undefined,
    y: typeof h.y === 'string' ? h.y : undefined,
  };
}

function cardFor(step: ToolStep, key: string) {
  const prov = resultProvenance(step.result);
  const sql = prov.sql ?? (typeof step.args.sql === 'string' ? step.args.sql : undefined);
  const title = typeof step.args.label === 'string' ? step.args.label : undefined;
  return (
    <ResultCard
      key={key}
      result={step.result}
      sql={sql}
      endorsed={prov.endorsed}
      title={title}
      chart={chartHint(step)}
    />
  );
}

function ctxIcon(kind: string): string {
  if (/table/i.test(kind)) return 'table';
  if (/model/i.test(kind)) return 'layers';
  return 'data';
}

/** A user turn: data-context chips (parsed from the stored preamble) + question. */
function UserRow({ text }: { text: string }) {
  const { chips, body } = splitUserMessage(text);
  return (
    <div className={styles.userRow}>
      <div className={styles.userBubble}>
        {chips.length > 0 ? (
          <div className={styles.ctxChips}>
            {chips.map((c, i) => (
              <span key={i} className={styles.ctxChip} title={`${c.kind}: ${c.label}`}>
                <Icon name={ctxIcon(c.kind)} size={11} color="var(--dex-accent)" />
                {c.label}
              </span>
            ))}
          </div>
        ) : null}
        {body ? <span className={styles.userText}>{body}</span> : null}
      </div>
    </div>
  );
}

function AssistantBlock({ msg }: { msg: AssistantMessage }) {
  const [open, setOpen] = useState(true);
  // Authored SQL cells (create_sql_cell results), keyed by cellId.
  const cellById = new Map<string, ToolStep>();
  for (const s of msg.steps) {
    const id = cellIdOf(s.result);
    if (id) cellById.set(id, s);
  }

  // What may surface to the user: SQL cells and governed semantic results. A
  // plain run_sql result is an internal scratchpad and is never shown.
  const showable = msg.steps.filter((s) => {
    if (!isSqlResult(s.result)) return false;
    return Boolean(cellIdOf(s.result)) || resultProvenance(s.result).via === 'semantic';
  });

  // Which cells the answer embeds inline (any bracketed tag resolving to a cell).
  const referenced = new Set<string>();
  CELL_TAG.lastIndex = 0;
  for (let m = CELL_TAG.exec(msg.text); m; m = CELL_TAG.exec(msg.text)) {
    const id = cellRefId(m[1], cellById);
    if (id) referenced.add(id);
  }
  const hasEmbeds = referenced.size > 0;

  // Anything showable but not embedded inline is listed below the answer, so a
  // SQL cell is always visible even when the agent didn't reference it.
  const belowCards = showable.filter((s) => {
    const id = cellIdOf(s.result);
    return !(id && referenced.has(id));
  });

  const renderAnswer = () => {
    if (!hasEmbeds) return <Markdown source={msg.text} className={styles.answerText} />;
    const nodes: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    CELL_TAG.lastIndex = 0;
    while ((m = CELL_TAG.exec(msg.text))) {
      const id = cellRefId(m[1], cellById);
      const step = id ? cellById.get(id) : undefined;
      if (!step) continue; // not a real cell ref → leave it in the surrounding text
      const before = msg.text.slice(last, m.index);
      if (before.trim()) {
        nodes.push(<Markdown key={`t${i}`} source={before} className={styles.answerText} />);
      }
      nodes.push(cardFor(step, `c${i}`));
      last = m.index + m[0].length;
      i++;
    }
    const tail = msg.text.slice(last);
    if (tail.trim())
      nodes.push(<Markdown key="tail" source={tail} className={styles.answerText} />);
    return <>{nodes}</>;
  };

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

      {/* assistant answer — with inline [cell:<id>] embeds (Hex visibility) */}
      {msg.text ? renderAnswer() : null}

      {/* governed/legacy result cards below the answer */}
      {belowCards.map((s) => cardFor(s, s.toolCallId))}

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
