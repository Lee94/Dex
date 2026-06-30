import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import {
  isSqlResult,
  outputNameOf,
  resultProvenance,
  toNum,
  vizCellsOf,
  type AssistantMessage,
  type SqlResult,
  type Thread,
  type ToolStep,
  type UserMessage,
  type VizCellRef,
} from '@/types';
import { Composer } from '@/components/Composer';
import { Markdown } from '@/components/Markdown';
import { ResultCard } from '@/components/ResultCard';
import { splitPreamble, splitUserMessage, type ProjectContext } from '@/lib/attachments';
import type { PinInput } from '@/lib/reports';
import { llmErrorMessage } from '@/lib/llmError';
import { useT, type Dict } from '@/i18n';
import styles from './ThreadView.module.css';

// The vinci chart stack is heavy — only pull it in when a thread embeds a chart.
const ThreadChart = lazy(() => import('./thread/ThreadChart'));

export function ThreadView({
  thread,
  onBack,
  onSend,
  onStop,
  onRetryLoad,
  onEdit,
  onRegenerate,
  onPin,
  onShare,
  project,
}: {
  thread: Thread;
  onBack: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetryLoad: () => void;
  /** Edit a user message's text and re-run the conversation from there (v3.2). */
  onEdit: (messageId: string, text: string) => void;
  /** Re-run the turn that produced an assistant message (v3.2). */
  onRegenerate: (messageId: string) => void;
  /** Pin a result/chart into the thread's report (v3.4). */
  onPin: (input: PinInput) => void;
  /** Open the thread's report (the Share affordance) (v3.4). */
  onShare: () => void;
  /** Shared context of the thread's project, folded into the first message. */
  project?: ProjectContext | null;
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
      <Header title={thread.title} onBack={onBack} onShare={onShare} />

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

          {thread.messages.map((m, i) =>
            m.role === 'user' ? (
              <UserRow key={m.id} msg={m} onEdit={onEdit} streaming={streaming} />
            ) : (
              <AssistantBlock
                key={m.id}
                msg={m}
                isLast={i === thread.messages.length - 1}
                streaming={streaming}
                onSend={onSend}
                onRegenerate={onRegenerate}
                onPin={onPin}
              />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        onSend={onSend}
        onStop={onStop}
        streaming={streaming}
        project={empty ? project : null}
      />
    </div>
  );
}

function Header({
  title,
  onBack,
  onShare,
}: {
  title: string;
  onBack: () => void;
  onShare: () => void;
}) {
  const t = useT();
  return (
    <div className={styles.header}>
      <IconButton
        icon="menu"
        size={17}
        color="var(--dex-text-strong)"
        title={t.thread.back}
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
      <Button variant="ghost" onClick={onShare}>
        <Icon name="share" size={14} color="var(--dex-icon)" />
        {t.thread.share}
      </Button>
    </div>
  );
}

function LoadingConversation() {
  const t = useT();
  return (
    <div className={styles.loadState}>
      <span className={styles.loadSpinner} />
      <span className={styles.loadText}>{t.thread.loadingConversation}</span>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className={styles.loadState}>
      <Icon name="help" size={22} color="var(--dex-danger)" />
      <div className={styles.loadText}>{t.thread.loadFailed}</div>
      <div className={styles.loadSubtext}>{message}</div>
      <Button variant="ghost" onClick={onRetry} style={{ marginTop: 4 }}>
        {t.common.retry}
      </Button>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const t = useT();
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMark}>
        <Icon name="components" size={24} color="#fff" />
      </div>
      <div className={styles.emptyTitle}>{t.thread.emptyTitle}</div>
      <div className={styles.emptyBody}>{t.thread.emptyBody}</div>
      <div className={styles.examples}>
        {t.thread.examples.map((ex) => (
          <button key={ex} className={styles.exampleChip} onClick={() => onPick(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

// The agent references a result with a bracketed tag whose prefix varies in
// practice ([result:<id>], [cell:<id>], or just [<id>]). Match any bracketed token,
// then pull out the id (the part after a ':' if present). It's an embed only
// when that id is a real result, so ordinary [text](link) markdown and other
// brackets stay literal.
const CELL_TAG = /\[([^\]\n]{6,})\]/g;

function cellRefId(bracketContent: string, hasCell: (id: string) => boolean): string | undefined {
  const raw = bracketContent.trim();
  const candidate = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1).trim() : raw;
  return hasCell(candidate) ? candidate : undefined;
}

/** Read a `ShowSql` / `ShowSemanticTable` result's embeddable id, if this step is one. */
function cellIdOf(result: unknown): string | undefined {
  if (typeof result === 'object' && result !== null) {
    const id = (result as { cellId?: unknown }).cellId;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

function cardFor(step: ToolStep, key: string, onPin?: (input: PinInput) => void) {
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
      onPin={onPin}
    />
  );
}

/**
 * A chart the visualization sub-agent authored, rendered read-only in the thread
 * over the upstream result's rows (resolved by `sourceOutputName`). The chart spec
 * (the vinci DSL) rides on the delegation tool result — there is no notebook.
 */
function VizCard({
  viz,
  source,
  onEdit,
  onPin,
}: {
  viz: VizCellRef;
  source?: SqlResult;
  /** Natural-language chart revision → sent to the agent as a follow-up (v3.3). */
  onEdit?: (message: string) => void;
  /** Pin this chart into the thread's report (v3.4). */
  onPin?: (input: PinInput) => void;
}) {
  const t = useT();
  return (
    <Suspense fallback={<div className={styles.answerText}>{t.thread.loadingChart}</div>}>
      <ThreadChart
        chartId={viz.cellId}
        dsl={viz.dsl}
        source={source}
        label={viz.label}
        onEdit={onEdit}
        onPin={onPin}
      />
    </Suspense>
  );
}

function ctxIcon(kind: string): string {
  if (/table/i.test(kind)) return 'table';
  if (/model/i.test(kind)) return 'layers';
  if (/project/i.test(kind)) return 'projects';
  return 'data';
}

/** A user turn: data-context chips (parsed from the stored preamble) + question.
 *  Hover reveals an edit affordance; editing rewrites the question and re-runs the
 *  conversation from this turn (preserving the attached-context preamble). */
function UserRow({
  msg,
  onEdit,
  streaming,
}: {
  msg: UserMessage;
  onEdit: (messageId: string, text: string) => void;
  streaming: boolean;
}) {
  const t = useT();
  const { chips, body } = splitUserMessage(msg.text);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);

  const cancel = () => {
    setEditing(false);
    setDraft(body);
  };
  const save = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === body) return;
    onEdit(msg.id, splitPreamble(msg.text).preamble + next);
  };

  if (editing) {
    return (
      <div className={styles.userRow}>
        <div className={styles.userEdit}>
          <textarea
            className={styles.userEditInput}
            value={draft}
            autoFocus
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                save();
              } else if (e.key === 'Escape') {
                cancel();
              }
            }}
          />
          <div className={styles.userEditActions}>
            <Button variant="ghost" onClick={cancel}>
              {t.common.cancel}
            </Button>
            <Button variant="green" onClick={save}>
              {t.thread.editSave}
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
      {!streaming ? (
        <button
          type="button"
          className={styles.editBtn}
          title={t.thread.edit}
          onClick={() => {
            setDraft(body);
            setEditing(true);
          }}
        >
          <Icon name="edit" size={13} color="var(--dex-icon-subtle)" />
        </button>
      ) : null}
    </div>
  );
}

/** Heuristic follow-up questions derived from the turn's last SQL result. */
function followUpsFor(msg: AssistantMessage, t: Dict): string[] {
  let result: SqlResult | undefined;
  for (const s of msg.steps) if (isSqlResult(s.result)) result = s.result;
  if (!result) return [];
  const cols = result.columns;
  const rows = result.rows;
  const isNumeric = (c: string) => rows.some((r) => toNum(r[c]) !== null);
  const dateCol = cols.find((c) => /date|month|day|year|time|week|quarter/i.test(c));
  const catCol = cols.find((c) => c !== dateCol && !isNumeric(c));
  const out: string[] = [];
  if (dateCol) out.push(t.thread.followUps.overTime);
  if (catCol) out.push(t.thread.followUps.breakdownBy(catCol));
  if (out.length < 3) out.push(t.thread.followUps.topDrivers);
  return out.slice(0, 3);
}

function AssistantBlock({
  msg,
  isLast,
  streaming,
  onSend,
  onRegenerate,
  onPin,
}: {
  msg: AssistantMessage;
  isLast: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onRegenerate: (messageId: string) => void;
  onPin: (input: PinInput) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  // Shown SQL/semantic results (ShowSql / ShowSemanticTable), keyed by their id.
  const cellById = new Map<string, ToolStep>();
  // SQL outputs keyed by their outputName — the rows a chart visualizes.
  const outputResults = new Map<string, SqlResult>();
  // Charts the visualization sub-agent built (lifted from the delegation result;
  // the sub-agent's build_chart isn't an analyst step), keyed by their id.
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
    if (step) return cardFor(step, key, onPin);
    const viz = vizById.get(id);
    if (viz) {
      const source = viz.sourceOutputName ? outputResults.get(viz.sourceOutputName) : undefined;
      return (
        <VizCard
          key={key}
          viz={viz}
          source={source}
          onEdit={streaming ? undefined : onSend}
          onPin={onPin}
        />
      );
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
              {msg.status === 'streaming' ? t.thread.workingFor : t.thread.workedFor}
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
                  labelOverride={t.thread.thinking}
                />
              )}
              {msg.reasoning ? <div className={styles.reasoning}>{msg.reasoning}</div> : null}
            </div>
          )}
        </>
      )}

      {/* assistant answer — with inline [result:<id>] embeds (Hex-style visibility) */}
      {msg.text ? renderAnswer() : null}

      {/* governed/legacy result cards below the answer */}
      {belowCards.map((s) => cardFor(s, s.toolCallId, onPin))}

      {/* charts the answer didn't embed inline — still always shown */}
      {belowViz.map((v) => (
        <VizCard
          key={v.cellId}
          viz={v}
          source={v.sourceOutputName ? outputResults.get(v.sourceOutputName) : undefined}
          onEdit={streaming ? undefined : onSend}
          onPin={onPin}
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
          <span>{llmErrorMessage(msg.errorText || '', t) || t.thread.somethingWrong}</span>
          {!streaming ? (
            <button
              type="button"
              className={styles.errorRetry}
              onClick={() => onRegenerate(msg.id)}
            >
              {t.thread.retry}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* turn actions (regenerate) — once the turn has settled */}
      {msg.status === 'done' && msg.text && !streaming ? (
        <div className={styles.assistantActions}>
          <button
            type="button"
            className={styles.actionBtn}
            title={t.thread.regenerate}
            onClick={() => onRegenerate(msg.id)}
          >
            <Icon name="refresh" size={12} color="var(--dex-icon-subtle)" />
            {t.thread.regenerate}
          </button>
        </div>
      ) : null}

      {/* suggested follow-ups — only under the latest settled answer */}
      {isLast && msg.status === 'done' && !streaming ? (
        <FollowUps msg={msg} onSend={onSend} />
      ) : null}
    </div>
  );
}

/** Clickable follow-up question chips derived from the turn's result. */
function FollowUps({ msg, onSend }: { msg: AssistantMessage; onSend: (text: string) => void }) {
  const t = useT();
  const suggestions = followUpsFor(msg, t);
  if (suggestions.length === 0) return null;
  return (
    <div className={styles.followUps}>
      <span className={styles.followUpsLabel}>{t.thread.followUpsLabel}</span>
      <div className={styles.followUpChips}>
        {suggestions.map((q) => (
          <button key={q} type="button" className={styles.followUpChip} onClick={() => onSend(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepRow({ step, labelOverride }: { step: ToolStep; labelOverride?: string }) {
  const t = useT();
  return (
    <div className={styles.step}>
      {step.status === 'running' ? (
        <Spinner />
      ) : step.status === 'error' ? (
        <Icon name="help" size={12} color="var(--dex-danger)" />
      ) : (
        <Icon name="tickCircle" size={12} color="var(--dex-success-check)" />
      )}
      <span>{labelOverride ?? stepLabel(step, t)}</span>
    </div>
  );
}

// Friendly timeline label for a tool step (the user sees these, never the tool
// name). Falls back to a humanized tool name for anything unmapped.
function stepLabel(step: ToolStep, t: Dict): string {
  const mapped = t.steps[step.toolName as keyof Dict['steps']];
  if (mapped) return mapped;
  const args = step.args || {};
  if (typeof args.sql === 'string') return t.steps.ranSql;
  if (Array.isArray(args.tableRefs)) return t.steps.inspectedSchemas;
  // Humanize an unmapped PascalCase tool name ("FooBar" → "Foo bar").
  if (step.toolName) {
    const words = step.toolName.replace(/([a-z])([A-Z])/g, '$1 $2');
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  }
  return t.steps.working;
}

function Spinner() {
  return <span className={styles.spinner} />;
}

function ElapsedLabel({ startedAt, finishedAt }: { startedAt: number; finishedAt?: number }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (finishedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [finishedAt]);
  const end = finishedAt ?? now;
  const secs = Math.max(0, Math.round((end - startedAt) / 1000));
  return <>{formatDuration(secs, t)}</>;
}

function formatDuration(s: number, t: Dict): string {
  if (s < 60) return t.duration.seconds(s);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return t.duration.minutesSeconds(m, r);
}
