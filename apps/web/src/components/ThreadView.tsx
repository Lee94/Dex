import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import {
  isSqlResult,
  outputNameOf,
  resultProvenance,
  vizCellsOf,
  type AssistantMessage,
  type SqlResult,
  type Thread,
  type ToolStep,
  type VizCellRef,
} from '@/types';
import { Composer } from '@/components/Composer';
import { Markdown } from '@/components/Markdown';
import { ResultCard } from '@/components/ResultCard';
import type { NotebookCell } from '@/lib/notebooks';
import { splitUserMessage } from '@/lib/attachments';
import styles from './ThreadView.module.css';

// The vinci chart stack is heavy — only pull it in when a thread embeds a chart.
const VizCell = lazy(() => import('./notebook/VizCell'));

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

function cellRefId(bracketContent: string, hasCell: (id: string) => boolean): string | undefined {
  const raw = bracketContent.trim();
  const candidate = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1).trim() : raw;
  return hasCell(candidate) ? candidate : undefined;
}

/** Read a `CreateSqlCell` / `CreateSemanticTable` result's cellId, if this step is one. */
function cellIdOf(result: unknown): string | undefined {
  if (typeof result === 'object' && result !== null) {
    const id = (result as { cellId?: unknown }).cellId;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

function cardFor(step: ToolStep, key: string) {
  const prov = resultProvenance(step.result);
  const sql = prov.sql ?? (typeof step.args.sql === 'string' ? step.args.sql : undefined);
  const title = typeof step.args.label === 'string' ? step.args.label : undefined;
  return (
    <ResultCard key={key} result={step.result} sql={sql} endorsed={prov.endorsed} title={title} />
  );
}

/**
 * A chart the visualization sub-agent authored, rendered in the thread by reusing
 * the notebook's vinci `VizCell` over the upstream SQL cell's rows (resolved by
 * `sourceOutputName`). Read-only here — edits belong in the notebook — so the
 * change callbacks are no-ops.
 */
function VizCard({ viz, source }: { viz: VizCellRef; source?: SqlResult }) {
  const cell: NotebookCell = {
    id: viz.cellId,
    kind: 'viz',
    source: '',
    sourceOutputName: viz.sourceOutputName,
    dsl: viz.dsl,
  };
  return (
    <Suspense fallback={<div className={styles.answerText}>Loading chart…</div>}>
      <VizCell
        cell={cell}
        sourceResult={source}
        sources={viz.sourceOutputName ? [viz.sourceOutputName] : []}
        onDslChange={() => {}}
        onSourceChange={() => {}}
        editable={false}
      />
    </Suspense>
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
  // Authored SQL cells (CreateSqlCell / CreateSemanticTable results), keyed by cellId.
  const cellById = new Map<string, ToolStep>();
  // SQL outputs keyed by their outputName — the rows a viz cell charts.
  const outputResults = new Map<string, SqlResult>();
  // Viz cells the visualization sub-agent created (lifted from the delegation
  // result; the sub-agent's create_viz_cell isn't an analyst step), keyed by cellId.
  const vizById = new Map<string, VizCellRef>();
  for (const s of msg.steps) {
    const id = cellIdOf(s.result);
    if (id) cellById.set(id, s);
    if (isSqlResult(s.result)) {
      const on = outputNameOf(s.result);
      if (on) outputResults.set(on, s.result);
    }
    for (const v of vizCellsOf(s.result)) vizById.set(v.cellId, v);
  }
  const hasCell = (id: string) => cellById.has(id) || vizById.has(id);

  // Render whichever kind of cell a resolved id refers to: a SQL result table or
  // a vinci chart over its upstream SQL cell's rows.
  const renderCell = (id: string, key: string): ReactNode => {
    const step = cellById.get(id);
    if (step) return cardFor(step, key);
    const viz = vizById.get(id);
    if (viz) {
      const source = viz.sourceOutputName ? outputResults.get(viz.sourceOutputName) : undefined;
      return <VizCard key={key} viz={viz} source={source} />;
    }
    return null;
  };

  // What may surface to the user: SQL cells and governed semantic results. A
  // plain RunSQL result is an internal scratchpad and is never shown.
  const showable = msg.steps.filter((s) => {
    if (!isSqlResult(s.result)) return false;
    return Boolean(cellIdOf(s.result)) || resultProvenance(s.result).via === 'semantic';
  });

  // Which cells the answer embeds inline (any bracketed tag resolving to a cell).
  const referenced = new Set<string>();
  CELL_TAG.lastIndex = 0;
  for (let m = CELL_TAG.exec(msg.text); m; m = CELL_TAG.exec(msg.text)) {
    const id = cellRefId(m[1], hasCell);
    if (id) referenced.add(id);
  }
  const hasEmbeds = referenced.size > 0;

  // Anything showable but not embedded inline is listed below the answer, so a
  // SQL cell / chart is always visible even when the agent didn't reference it.
  const belowCards = showable.filter((s) => {
    const id = cellIdOf(s.result);
    return !(id && referenced.has(id));
  });
  const belowViz = [...vizById.values()].filter((v) => !referenced.has(v.cellId));

  const renderAnswer = () => {
    if (!hasEmbeds) return <Markdown source={msg.text} className={styles.answerText} />;
    const nodes: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    CELL_TAG.lastIndex = 0;
    while ((m = CELL_TAG.exec(msg.text))) {
      const id = cellRefId(m[1], hasCell);
      const node = id ? renderCell(id, `c${i}`) : null;
      if (!node) continue; // not a real cell ref → leave it in the surrounding text
      const before = msg.text.slice(last, m.index);
      if (before.trim()) {
        nodes.push(<Markdown key={`t${i}`} source={before} className={styles.answerText} />);
      }
      nodes.push(node);
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

      {/* charts the answer didn't embed inline — still always shown */}
      {belowViz.map((v) => (
        <VizCard
          key={v.cellId}
          viz={v}
          source={v.sourceOutputName ? outputResults.get(v.sourceOutputName) : undefined}
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

// Friendly timeline labels for the Hex-named tools (the user sees these, never the
// tool name). Falls back to a humanized tool name for anything unmapped.
const STEP_LABELS: Record<string, string> = {
  GetCurrentDateTime: 'Checked the current date',
  ListDataConnections: 'Listed data connections',
  FindTableSchemas: 'Searched for tables',
  ViewTables: 'Inspected table schemas',
  RunSQL: 'Ran a SQL query',
  CreateSqlCell: 'Created a SQL cell',
  FindSemanticColumns: 'Searched the semantic layer',
  InspectSemanticData: 'Inspected semantic data',
  CreateSemanticTable: 'Built a semantic table',
  CellSearch: 'Reviewed the notebook',
  ReadGuide: 'Consulted the guides',
  SaveMemory: 'Saved a preference',
  SuggestReview: 'Flagged for review',
  SearchWeb: 'Searched the web',
  ExtractWeb: 'Read a web page',
  GetFileContents: 'Read an attached file',
  SearchTools: 'Looked up its tools',
  DelegateToDataDiscoveryAgent: 'Delegated data discovery',
  DelegateToVisualizationAgent: 'Created a visualization',
  CreateTask: 'Scheduled a task',
  ViewTask: 'Reviewed scheduled tasks',
  ReadPastThreadSummary: 'Recalled past work',
};

function stepLabel(step: ToolStep): string {
  const mapped = STEP_LABELS[step.toolName];
  if (mapped) return mapped;
  const args = step.args || {};
  if (typeof args.sql === 'string') return 'Ran a SQL query';
  if (Array.isArray(args.tableRefs)) return 'Inspected table schemas';
  // Humanize an unmapped PascalCase tool name ("FooBar" → "Foo bar").
  if (step.toolName) {
    const words = step.toolName.replace(/([a-z])([A-Z])/g, '$1 $2');
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  }
  return 'Working';
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
