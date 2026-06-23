import { mastra } from '@/lib/mastraClient';
import type { AssistantMessage, ChatMessage, Thread, ToolStep } from '@/types';

/**
 * Thread persistence (v0.2).
 *
 * Threads + their conversation live in Mastra's memory store on the agent
 * (`mastra.db`), keyed by a stable `threadId` and a single-user `resourceId`.
 * This module is the seam between that server-side memory and the UI's
 * `Thread`/`ChatMessage` shapes: listing, lazy-loading a thread's history,
 * renaming, deleting, and reconstructing the "thinking" timeline + result cards
 * from the stored message parts.
 */

// The agent is registered as `analyst`; memory writes need the agentId so the
// server can resolve the right memory pipeline.
export const AGENT_ID = 'analyst';
// Single-user/local app: every thread belongs to one resource (multi-user/auth
// is icebox). Filtering the thread list by this keeps it scoped to "your" work.
export const RESOURCE_ID = 'dex-local-user';
export const CREATOR = 'you@dex.local';
export const CREATOR_INITIAL = 'Y';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/** Mint a client-side thread id so the UI controls it before the first message
 *  creates the server thread (via the memory option on `stream`). */
export const newThreadId = uid;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function toMs(date: unknown): number {
  if (date instanceof Date) return date.getTime();
  if (typeof date === 'number') return date;
  if (typeof date === 'string') {
    const t = Date.parse(date);
    return Number.isNaN(t) ? Date.now() : t;
  }
  return Date.now();
}

/** "just now" / "2 hrs ago" / a date — the relative label the lists show. */
export function relativeTime(at: number): string {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString();
}

export function titleFromText(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || 'New thread';
}

// ---------------------------------------------------------------------------
// Thread list / CRUD
// ---------------------------------------------------------------------------

type ThreadSummaryRow = {
  id: string;
  title?: string;
  updatedAt?: string | Date;
  createdAt?: string | Date;
};

function threadFromSummary(row: ThreadSummaryRow): Thread {
  const updatedAt = toMs(row.updatedAt ?? row.createdAt);
  return {
    id: row.id,
    title: row.title || 'Untitled thread',
    updated: relativeTime(updatedAt),
    updatedAt,
    creator: CREATOR,
    initial: CREATOR_INITIAL,
    messages: [],
    messagesLoaded: false,
  };
}

/** List the saved threads for this resource, most-recently-updated first. */
export async function listThreads(): Promise<Thread[]> {
  const res = await mastra.listMemoryThreads({
    agentId: AGENT_ID,
    resourceId: RESOURCE_ID,
    perPage: 100,
    orderBy: { field: 'updatedAt', direction: 'DESC' },
  });
  return (res.threads ?? []).map((t) => threadFromSummary(t as ThreadSummaryRow));
}

/** Load + reconstruct a thread's full conversation history. */
export async function loadThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const thread = mastra.getMemoryThread({ threadId, agentId: AGENT_ID });
  const res = await thread.listMessages({
    perPage: false,
    orderBy: { field: 'createdAt', direction: 'ASC' },
  });
  return reconstructMessages(res.messages ?? []);
}

export async function renameThread(threadId: string, title: string): Promise<void> {
  const thread = mastra.getMemoryThread({ threadId, agentId: AGENT_ID });
  await thread.update({ title, metadata: {}, resourceId: RESOURCE_ID, agentId: AGENT_ID });
}

export async function deleteThread(threadId: string): Promise<void> {
  const thread = mastra.getMemoryThread({ threadId, agentId: AGENT_ID });
  await thread.delete({ agentId: AGENT_ID });
}

// ---------------------------------------------------------------------------
// Reconstruction: stored Mastra messages -> UI ChatMessage[]
// ---------------------------------------------------------------------------
//
// A stored message is `{ role, createdAt, content: { parts: [...] } }`. Parts we
// care about: `text` (answer), `reasoning` (summarized thinking), and
// `tool-invocation` (a step in the "show your work" timeline; a run_sql result
// becomes a ResultCard via isSqlResult). Consecutive assistant messages from one
// turn are merged into a single assistant block, mirroring the live stream UI.

type StoredToolInvocation = {
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  state?: string;
  result?: unknown;
  errorText?: string;
};

type StoredPart = {
  type?: string;
  text?: string;
  reasoning?: string;
  toolInvocation?: StoredToolInvocation;
};

type StoredMessage = {
  id?: string;
  role?: string;
  createdAt?: string | Date;
  content?: { parts?: StoredPart[]; content?: string };
};

function textOfParts(parts: StoredPart[]): string {
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
}

export function reconstructMessages(messages: readonly StoredMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let current: AssistantMessage | null = null;

  const flush = () => {
    if (current) {
      out.push(current);
      current = null;
    }
  };

  for (const msg of messages) {
    const parts = msg.content?.parts ?? [];

    if (msg.role === 'user') {
      flush();
      out.push({
        id: msg.id ?? uid(),
        role: 'user',
        text: textOfParts(parts) || msg.content?.content || '',
      });
      continue;
    }

    if (msg.role !== 'assistant') continue; // ignore system / signal

    if (!current) {
      const started = toMs(msg.createdAt);
      current = {
        id: msg.id ?? uid(),
        role: 'assistant',
        text: '',
        reasoning: '',
        steps: [],
        status: 'done',
        startedAt: started,
        finishedAt: started,
      };
    }

    for (const p of parts) {
      if (p.type === 'text' && typeof p.text === 'string') {
        current.text += p.text;
      } else if (p.type === 'reasoning') {
        current.reasoning += p.text ?? p.reasoning ?? '';
      } else if (p.type === 'tool-invocation' && p.toolInvocation) {
        const ti = p.toolInvocation;
        const isError = ti.state === 'output-error';
        const step: ToolStep = {
          toolCallId: ti.toolCallId ?? uid(),
          toolName: ti.toolName ?? '',
          args: (ti.args as Record<string, unknown>) ?? {},
          result: ti.result,
          isError,
          status: isError ? 'error' : 'done',
          errorText: ti.errorText,
        };
        current.steps.push(step);
      }
    }
    current.finishedAt = toMs(msg.createdAt);
  }

  flush();
  return out;
}
