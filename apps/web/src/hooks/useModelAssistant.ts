import { useCallback, useRef, useState } from 'react';
import { semanticModelAgent } from '@/lib/mastraClient';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
export interface CubeProposal {
  cube: unknown;
  yaml: string;
}

/** The data connection a semantic project is bound to. The assistant must author
 *  cubes only from this connection's tables. */
export interface AssistantSource {
  id: string;
  name: string;
  dialect: string;
  builtin: boolean;
}

const uid = () => crypto.randomUUID();

/**
 * A leading instruction that pins the stateless studio agent to the project's
 * bound data connection and tells it which project it's in. We prepend it to the
 * first user message on every send (it never enters the displayed `messages`, so
 * the UI stays clean). Without the connection clause the agent's discovery tools
 * default to the built-in warehouse and author cubes from an unrelated database;
 * without the projectId clause it can't list/join the project's other models.
 * Mirrors the analyst's `contextPrefix` datasource handling.
 */
function sourcePreamble(source: AssistantSource, projectId?: string): string {
  const connection = source.builtin
    ? 'This data model is bound to the built-in sample warehouse — author its own table only from ' +
      "that warehouse's tables; do not target any other data connection. "
    : `This data model is bound to data connection "${source.name}" (id: ${source.id}, a ${source.dialect} ` +
      `database). Pass dataConnectionId "${source.id}" to EVERY ViewTables / FindTableSchemas call and ` +
      "author this cube's own table only from this connection; never query the built-in warehouse or " +
      'any other connection. ';
  const project = projectId
    ? `This model belongs to project "${projectId}". Pass projectId "${projectId}" to ListProjectModels ` +
      '(to find other models in this project to join to) and to propose_cube. '
    : '';
  return `${connection}${project}\n\n`;
}

/** Coerce an unknown error (string / Error / structured chunk payload) into a
 *  readable message — stream error payloads are often objects, not strings. */
function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

/**
 * The data-model editor's assistant — a deliberately lightweight cousin of
 * useThreads. It keeps the message history client-side and re-sends it whole each
 * turn (no server memory), and the stream only needs two chunk types: text-delta
 * (the reply) and a `propose_cube` tool-result (the generated cube/YAML, handed to
 * the editor via `onProposal`).
 */
export function useModelAssistant(opts: {
  onProposal: (p: CubeProposal) => void;
  source?: AssistantSource;
  projectId?: string;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const onProposalRef = useRef(opts.onProposal);
  onProposalRef.current = opts.onProposal;
  // Current bound source + project, read inside `send` without widening its deps.
  const sourceRef = useRef(opts.source);
  sourceRef.current = opts.source;
  const projectIdRef = useRef(opts.projectId);
  projectIdRef.current = opts.projectId;
  // Always-current view of `messages` so `send` can read the latest history
  // without depending on it (and without relying on a setState updater's side
  // effect — see the note in `send`).
  const messagesRef = useRef<AssistantMessage[]>(messages);
  messagesRef.current = messages;

  const patch = (id: string, fn: (m: AssistantMessage) => AssistantMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);

      const userMsg: AssistantMessage = { id: uid(), role: 'user', text: trimmed };
      const assistantId = uid();
      // Full history (stateless): everything so far + this turn. Build it from the
      // ref (the latest committed messages), NOT from a variable assigned inside a
      // `setMessages` updater — React may defer that updater past the `stream()`
      // call below, leaving `history` empty and sending a `messages: []` request
      // that the provider rejects with 400 ("messages: at least one message is
      // required"). The ref also avoids a stale `messages` closure (`send` only
      // depends on `streaming`).
      const history: AssistantMessage[] = [...messagesRef.current, userMsg];
      setMessages([...history, { id: assistantId, role: 'assistant', text: '' }]);
      setStreaming(true);

      let aborted = false;
      let cancelBody: (() => void) | undefined;
      stopRef.current = () => {
        aborted = true;
        cancelBody?.();
        setStreaming(false);
      };

      try {
        // Pin the agent to the project's bound data connection by prepending a
        // source preamble to the first (user) message. Built fresh each send from
        // the ref, so it's never stored in the displayed history and can't double up.
        const agentMessages = history.map((m) => ({ role: m.role, content: m.text }));
        const source = sourceRef.current;
        if (source && agentMessages.length > 0) {
          agentMessages[0] = {
            ...agentMessages[0],
            content: sourcePreamble(source, projectIdRef.current) + agentMessages[0].content,
          };
        }
        const response = await semanticModelAgent.stream(
          agentMessages as Parameters<typeof semanticModelAgent.stream>[0],
        );
        cancelBody = () => {
          try {
            void response.body?.cancel();
          } catch {
            /* body may already be closed */
          }
        };
        await response.processDataStream({
          onChunk: (chunk) => {
            if (aborted) return;
            switch (chunk.type) {
              case 'text-delta':
                patch(assistantId, (m) => ({ ...m, text: m.text + chunk.payload.text }));
                break;
              case 'tool-result': {
                if (chunk.payload.toolName !== 'propose_cube') break;
                const r = chunk.payload.result as { cube?: unknown; yaml?: string } | undefined;
                if (r && typeof r.yaml === 'string') {
                  onProposalRef.current({ cube: r.cube, yaml: r.yaml });
                }
                break;
              }
              case 'error':
                setError(errText(chunk.payload.error));
                break;
              default:
                break;
            }
          },
        });
      } catch (e) {
        if (!aborted) setError(errText(e));
      } finally {
        setStreaming(false);
        stopRef.current = null;
        // Drop the placeholder if the turn produced no text (e.g. it errored
        // before any delta) so no empty "thinking…" bubble lingers.
        setMessages((prev) => prev.filter((m) => !(m.id === assistantId && m.text === '')));
      }
    },
    [streaming],
  );

  const stop = useCallback(() => stopRef.current?.(), []);
  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, streaming, error, send, stop, reset };
}
