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
};

export type ChatMessage = UserMessage | AssistantMessage;

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
