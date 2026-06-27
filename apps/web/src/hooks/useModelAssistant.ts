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

const uid = () => crypto.randomUUID();

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
export function useModelAssistant(opts: { onProposal: (p: CubeProposal) => void }) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const onProposalRef = useRef(opts.onProposal);
  onProposalRef.current = opts.onProposal;

  const patch = (id: string, fn: (m: AssistantMessage) => AssistantMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);

      const userMsg: AssistantMessage = { id: uid(), role: 'user', text: trimmed };
      const assistantId = uid();
      // Full history (stateless): everything so far + this turn.
      let history: AssistantMessage[] = [];
      setMessages((prev) => {
        history = [...prev, userMsg];
        return [...history, { id: assistantId, role: 'assistant', text: '' }];
      });
      setStreaming(true);

      let aborted = false;
      let cancelBody: (() => void) | undefined;
      stopRef.current = () => {
        aborted = true;
        cancelBody?.();
        setStreaming(false);
      };

      try {
        const response = await semanticModelAgent.stream(
          history.map((m) => ({ role: m.role, content: m.text })) as Parameters<
            typeof semanticModelAgent.stream
          >[0],
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
