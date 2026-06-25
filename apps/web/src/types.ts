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

/* -------------------------------------------------------------------------- */
/* v0.5 — column classification + chart-shape inference                        */
/* -------------------------------------------------------------------------- */

/** How a result column reads, used to pick a sensible default visualization. */
export type ColumnType = 'temporal' | 'numeric' | 'categorical';

/** The visualizations a result card can render. `table` is the universal one. */
export type ChartType = 'table' | 'bar' | 'line' | 'area';

/** Coerce a cell to a finite number, or null. Shared by the table + charts. */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** A string that reads as a date/month/timestamp (e.g. `2024-01`, `2024-01-31`). */
export function isTemporalValue(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return /^\d{4}-\d{2}(-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?)?$/.test(v.trim());
}

/** Classify one column from its values; numbers win over temporal-looking ints. */
function classifyColumn(values: unknown[]): ColumnType {
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (present.length === 0) return 'categorical';
  if (present.every((v) => toNum(v) !== null)) return 'numeric';
  if (present.every((v) => isTemporalValue(v))) return 'temporal';
  return 'categorical';
}

/** Per-column types, in column order. */
export function classifyColumns(result: SqlResult): ColumnType[] {
  return result.columns.map((c) => classifyColumn(result.rows.map((r) => r[c])));
}

/** A chart hint the agent can attach to a result/cell (see create_sql_cell). */
export type ChartHint = { type?: ChartType; x?: string; y?: string };

/**
 * Decide whether a result is chartable and the chart type to default to. Unlike
 * the original 2-column-only rule (v0.5), this also handles **wide** results
 * (>2 columns): it picks an x axis (first temporal, else first categorical) and a
 * y measure (first numeric column that isn't x). A temporal x reads best as a
 * **line** (and tolerates many points); a categorical x as a **bar**. Wide tables
 * with a categorical x stay a **table** by default but remain switchable.
 */
export function inferChartShape(result: SqlResult): {
  chartable: boolean;
  defaultType: ChartType;
  columnTypes: ColumnType[];
  xKey?: string;
  yKey?: string;
} {
  const columnTypes = classifyColumns(result);
  const typeOf = (c: string): ColumnType => columnTypes[result.columns.indexOf(c)];

  const xKey =
    result.columns.find((c) => typeOf(c) === 'temporal') ??
    result.columns.find((c) => typeOf(c) === 'categorical');
  const yKey = result.columns.find((c) => typeOf(c) === 'numeric' && c !== xKey);
  const xIsTemporal = !!xKey && typeOf(xKey) === 'temporal';

  // A line over a time series tolerates many points; a bar of categories doesn't.
  const cap = xIsTemporal ? 1000 : 60;
  const chartable =
    result.rows.length > 0 && result.rows.length <= cap && xKey !== undefined && yKey !== undefined;

  const defaultType: ChartType = !chartable
    ? 'table'
    : xIsTemporal
      ? 'line'
      : result.columns.length === 2
        ? 'bar'
        : 'table';

  return { chartable, defaultType, columnTypes, xKey, yKey };
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
