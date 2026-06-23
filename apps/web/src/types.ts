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

/** Shape of a successful run_sql tool result. */
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

/**
 * Provenance a result may carry. The v0.4 semantic layer's `query_semantic`
 * returns the compiled `sql`, whether it came from an `endorsed` (trusted)
 * definition, and `via: 'semantic'`. Raw `run_sql` results carry none of these.
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
