/** One tool invocation the agent made while working on a question. */
export type ToolStep = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  status: 'running' | 'done' | 'error';
  errorText?: string;
};

export type UserMessage = {
  id: string;
  role: 'user';
  text: string;
};

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  /** Final answer text, streamed token by token. */
  text: string;
  /** Summarized model reasoning, if the model streams any. */
  reasoning: string;
  /** The agent's tool steps, in order — this is the "show your work" timeline. */
  steps: ToolStep[];
  status: 'streaming' | 'done' | 'error';
  errorText?: string;
  /** Epoch ms when the turn started, for the "Worked for …" timer. */
  startedAt: number;
  /** Epoch ms when the turn finished. */
  finishedAt?: number;
};

export type ChatMessage = UserMessage | AssistantMessage;

/** A conversation. Persisted server-side via Mastra memory (see lib/threads.ts). */
export type Thread = {
  id: string;
  title: string;
  /** The project this thread belongs to, if any (stored in Mastra thread metadata).
   *  Undefined = a loose thread not in any project. */
  projectId?: string;
  /** Display string for the threads list, e.g. "2 hrs ago" / "just now". */
  updated: string;
  /** Epoch ms of the last update, for sorting and recomputing `updated`. */
  updatedAt?: number;
  creator: string;
  /** Single-letter avatar initial. */
  initial: string;
  messages: ChatMessage[];
  /** Whether `messages` has been hydrated from the store yet (lazy on open). */
  messagesLoaded?: boolean;
  /** True while a thread's history is being fetched. */
  loadingMessages?: boolean;
  /** Set if loading this thread's history failed (shows a retry affordance). */
  loadError?: string;
};

/** Shape of a successful SQL tool result (RunSQL / ShowSql / ShowSemanticTable). */
export type SqlResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
};

export function isSqlResult(value: unknown): value is SqlResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as SqlResult).columns) &&
    Array.isArray((value as SqlResult).rows)
  );
}

/** Read a SQL result's `outputName` (the name a chart binds to). `ShowSql` /
 *  `ShowSemanticTable` results carry it; raw `RunSQL` results don't. */
export function outputNameOf(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null) {
    const on = (value as { outputName?: unknown }).outputName;
    if (typeof on === 'string' && on) return on;
  }
  return undefined;
}

/**
 * A chart the visualization sub-agent built. It's authored inside the sub-agent
 * (not an analyst step), so the analyst surfaces it through the
 * `DelegateToVisualizationAgent` result; the thread renders it over the upstream
 * result's rows (matched by `sourceOutputName`). `cellId` is just the embeddable id.
 */
export type VizCellRef = {
  cellId: string;
  sourceOutputName?: string;
  dsl?: unknown;
  label?: string;
};

/** Read charts out of a `DelegateToVisualizationAgent` tool result, if any. */
export function vizCellsOf(value: unknown): VizCellRef[] {
  if (typeof value !== 'object' || value === null) return [];
  const cells = (value as { vizCells?: unknown }).vizCells;
  if (!Array.isArray(cells)) return [];
  return cells.filter(
    (c): c is VizCellRef =>
      typeof c === 'object' && c !== null && typeof (c as VizCellRef).cellId === 'string',
  );
}

/* -------------------------------------------------------------------------- */
/* Value coercion (shared by the result table + CSV export)                    */
/* -------------------------------------------------------------------------- */

/** Coerce a cell to a finite number, or null. Shared by the table + CSV export. */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Serialize a result to CSV (RFC-4180 quoting), for download/clipboard export. */
export function toCsv(result: SqlResult): string {
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = result.columns.map(esc).join(',');
  const body = result.rows.map((r) => result.columns.map((c) => esc(r[c])).join(','));
  return [head, ...body].join('\n');
}

/**
 * Provenance a result may carry. The semantic layer's `ShowSemanticTable`
 * returns the compiled `sql`, whether it came from an `endorsed` (trusted)
 * definition, and `via: 'semantic'`. Raw `RunSQL` results carry none of these.
 */
export type ResultProvenance = { sql?: string; endorsed: boolean; via?: string };

export function resultProvenance(value: unknown): ResultProvenance {
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    return {
      sql: typeof v.sql === 'string' ? v.sql : undefined,
      endorsed: v.endorsed === true,
      via: typeof v.via === 'string' ? v.via : undefined,
    };
  }
  return { endorsed: false };
}
