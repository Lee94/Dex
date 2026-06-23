import { useCallback, useState } from 'react';
import { analystAgent } from '../lib/mastraClient';
import type { AssistantMessage, ChatMessage, Thread, ToolStep } from '../types';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// Seed one thread so the Threads list matches the design's populated look.
function seedThreads(): Thread[] {
  return [
    {
      id: uid(),
      title: 'Bar chart data',
      updated: '2 hrs ago',
      creator: 'fay@fanruan.com',
      initial: 'f',
      messages: [],
    },
  ];
}

function titleFromText(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 48 ? t.slice(0, 48) + '…' : t || 'New thread';
}

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>(seedThreads);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  const createThread = useCallback((): string => {
    const id = uid();
    const thread: Thread = {
      id,
      title: 'New thread',
      updated: 'just now',
      creator: 'you@dex.local',
      initial: 'Y',
      messages: [],
    };
    setThreads((prev) => [thread, ...prev]);
    setActiveId(id);
    return id;
  }, []);

  /** Immutably patch a single assistant message inside a thread. */
  const patchAssistant = useCallback(
    (threadId: string, msgId: string, patch: (m: AssistantMessage) => AssistantMessage) => {
      setThreads((prev) =>
        prev.map((t) =>
          t.id !== threadId
            ? t
            : {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === msgId && m.role === 'assistant' ? patch(m) : m,
                ),
              },
        ),
      );
    },
    [],
  );

  const sendMessage = useCallback(
    async (threadId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg: ChatMessage = { id: uid(), role: 'user', text: trimmed };
      const assistantId = uid();
      const assistantMsg: AssistantMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        reasoning: '',
        steps: [],
        status: 'streaming',
        startedAt: Date.now(),
      };

      // Snapshot history (before this turn) to send to the agent. Use literal
      // roles so the array matches the SDK's MessageListInput union.
      const current = threads.find((t) => t.id === threadId);
      const history = (current?.messages ?? []).map((m) =>
        m.role === 'user'
          ? { role: 'user' as const, content: m.text }
          : { role: 'assistant' as const, content: m.text },
      );
      const payload = [...history, { role: 'user' as const, content: trimmed }];
      const isFirst = (current?.messages.length ?? 0) === 0;

      // Optimistically append the user message + streaming placeholder.
      setThreads((prev) =>
        prev.map((t) =>
          t.id !== threadId
            ? t
            : {
                ...t,
                title: isFirst ? titleFromText(trimmed) : t.title,
                updated: 'just now',
                messages: [...t.messages, userMsg, assistantMsg],
              },
        ),
      );

      try {
        const response = await analystAgent.stream(payload);
        await response.processDataStream({
          onChunk: (chunk) => {
            switch (chunk.type) {
              case 'text-delta':
                patchAssistant(threadId, assistantId, (m) => ({ ...m, text: m.text + chunk.payload.text }));
                break;
              case 'reasoning-delta':
                patchAssistant(threadId, assistantId, (m) => ({
                  ...m,
                  reasoning: m.reasoning + chunk.payload.text,
                }));
                break;
              case 'tool-call': {
                const step: ToolStep = {
                  toolCallId: chunk.payload.toolCallId,
                  toolName: chunk.payload.toolName,
                  args: (chunk.payload.args as Record<string, unknown>) ?? {},
                  status: 'running',
                };
                patchAssistant(threadId, assistantId, (m) => ({ ...m, steps: [...m.steps, step] }));
                break;
              }
              case 'tool-result':
                patchAssistant(threadId, assistantId, (m) => ({
                  ...m,
                  steps: m.steps.map((s) =>
                    s.toolCallId === chunk.payload.toolCallId
                      ? { ...s, result: chunk.payload.result, isError: chunk.payload.isError, status: 'done' }
                      : s,
                  ),
                }));
                break;
              case 'tool-error':
                patchAssistant(threadId, assistantId, (m) => ({
                  ...m,
                  steps: m.steps.map((s) =>
                    s.toolCallId === chunk.payload.toolCallId
                      ? { ...s, status: 'error', errorText: String(chunk.payload.error) }
                      : s,
                  ),
                }));
                break;
              case 'error':
                patchAssistant(threadId, assistantId, (m) => ({
                  ...m,
                  status: 'error',
                  errorText: String(chunk.payload.error),
                }));
                break;
              default:
                break;
            }
          },
        });

        patchAssistant(threadId, assistantId, (m) => ({
          ...m,
          status: m.status === 'error' ? 'error' : 'done',
          finishedAt: Date.now(),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patchAssistant(threadId, assistantId, (m) => ({
          ...m,
          status: 'error',
          errorText: message,
          finishedAt: Date.now(),
        }));
      }
    },
    [threads, patchAssistant],
  );

  return { threads, activeId, activeThread, setActiveId, createThread, sendMessage };
}
