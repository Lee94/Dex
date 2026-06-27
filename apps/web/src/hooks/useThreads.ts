import { useCallback, useEffect, useRef, useState } from 'react';
import { analystAgent } from '@/lib/mastraClient';
import { getDict } from '@/i18n/store';
import { saveThreadSummary } from '@/lib/tasks';
import {
  CREATOR,
  CREATOR_INITIAL,
  RESOURCE_ID,
  deleteThread as deleteThreadApi,
  listThreads,
  loadThreadMessages,
  newThreadId,
  relativeTime,
  titleFromText,
  updateThreadMeta,
} from '@/lib/threads';
import type { AssistantMessage, ChatMessage, Thread, ToolStep } from '@/types';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Stop handler for the in-flight stream (one at a time — the composer is
  // disabled while streaming).
  const stopRef = useRef<(() => void) | null>(null);
  const didInit = useRef(false);

  /** Immutably patch a single thread by id. */
  const patchThread = useCallback((threadId: string, patch: (t: Thread) => Thread) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? patch(t) : t)));
  }, []);

  /** Immutably patch a single assistant message inside a thread. */
  const patchAssistant = useCallback(
    (threadId: string, msgId: string, patch: (m: AssistantMessage) => AssistantMessage) => {
      patchThread(threadId, (t) => ({
        ...t,
        messages: t.messages.map((m) => (m.id === msgId && m.role === 'assistant' ? patch(m) : m)),
      }));
    },
    [patchThread],
  );

  // --- lazy-load a thread's conversation history from the store ---
  const loadMessages = useCallback(
    async (threadId: string) => {
      patchThread(threadId, (t) => ({ ...t, loadingMessages: true, loadError: undefined }));
      try {
        const messages = await loadThreadMessages(threadId);
        patchThread(threadId, (t) => ({
          ...t,
          messages,
          messagesLoaded: true,
          loadingMessages: false,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patchThread(threadId, (t) => ({ ...t, loadingMessages: false, loadError: message }));
      }
    },
    [patchThread],
  );

  // --- load the saved thread list on mount, restore the active selection ---
  const refreshList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const loaded = await listThreads();
      setThreads(loaded);
      setListLoading(false);
      return loaded;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setListError(message);
      setListLoading(false);
      return [] as Thread[];
    }
  }, []);

  useEffect(() => {
    if (didInit.current) return; // guard StrictMode double-invoke
    didInit.current = true;
    void refreshList();
  }, [refreshList]);

  const createThread = useCallback((projectId?: string): string => {
    const id = newThreadId();
    const now = Date.now();
    const thread: Thread = {
      id,
      title: getDict().threadsList.defaultTitle,
      projectId,
      updated: relativeTime(now),
      updatedAt: now,
      creator: CREATOR,
      initial: CREATOR_INITIAL,
      messages: [],
      messagesLoaded: true, // brand new — nothing to load from the store yet
    };
    setThreads((prev) => [thread, ...prev]);
    return id;
  }, []);

  const renameThread = useCallback(
    (threadId: string, rawTitle: string) => {
      const title = rawTitle.trim();
      if (!title) return;
      // Preserve the thread's project membership — `update` replaces metadata.
      const projectId = threads.find((t) => t.id === threadId)?.projectId;
      patchThread(threadId, (t) => ({ ...t, title }));
      void updateThreadMeta(threadId, { title, projectId }).catch((err) => {
        console.error('Failed to rename thread', err);
      });
    },
    [patchThread, threads],
  );

  const removeThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    void deleteThreadApi(threadId).catch((err) => {
      console.error('Failed to delete thread', err);
    });
  }, []);

  /** Move a thread into a project (or out of any project when `projectId` is null). */
  const moveThreadToProject = useCallback(
    (threadId: string, projectId: string | null) => {
      const current = threads.find((t) => t.id === threadId);
      if (!current) return;
      patchThread(threadId, (t) => ({ ...t, projectId: projectId ?? undefined }));
      void updateThreadMeta(threadId, { title: current.title, projectId }).catch((err) => {
        console.error('Failed to move thread', err);
      });
    },
    [patchThread, threads],
  );

  const stop = useCallback(() => {
    stopRef.current?.();
  }, []);

  const sendMessage = useCallback(
    async (threadId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const current = threads.find((t) => t.id === threadId);
      const isFirst = (current?.messages.length ?? 0) === 0;
      const title = isFirst ? titleFromText(trimmed) : current?.title;
      const projectId = current?.projectId;

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

      // Optimistically append the user message + streaming placeholder, and
      // (on the first turn) adopt the auto-title.
      patchThread(threadId, (t) => ({
        ...t,
        title: isFirst ? title! : t.title,
        updated: relativeTime(Date.now()),
        updatedAt: Date.now(),
        messages: [...t.messages, userMsg, assistantMsg],
      }));

      // --- abortable streaming (soft stop) ---
      let aborted = false;
      let answerText = ''; // accumulated for the recallable thread summary (v1.3)
      let cancelBody: (() => void) | undefined;
      stopRef.current = () => {
        aborted = true;
        cancelBody?.();
        patchAssistant(threadId, assistantId, (m) =>
          m.status === 'streaming' ? { ...m, status: 'done', finishedAt: Date.now() } : m,
        );
      };

      try {
        // Memory replays this thread's prior turns server-side, so we send only
        // the new user message. On the first turn we seed the thread's title.
        const response = await analystAgent.stream([{ role: 'user', content: trimmed }], {
          memory: {
            thread: isFirst ? { id: threadId, title: title! } : threadId,
            resource: RESOURCE_ID,
          },
        });
        cancelBody = () => {
          try {
            void response.body?.cancel();
          } catch {
            /* body may already be locked/closed */
          }
        };

        await response.processDataStream({
          onChunk: (chunk) => {
            if (aborted) return;
            switch (chunk.type) {
              case 'text-delta':
                answerText += chunk.payload.text;
                patchAssistant(threadId, assistantId, (m) => ({
                  ...m,
                  text: m.text + chunk.payload.text,
                }));
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
                      ? {
                          ...s,
                          result: chunk.payload.result,
                          isError: chunk.payload.isError,
                          status: 'done',
                        }
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

        if (!aborted) {
          patchAssistant(threadId, assistantId, (m) => ({
            ...m,
            status: m.status === 'error' ? 'error' : 'done',
            finishedAt: Date.now(),
          }));
          patchThread(threadId, (t) => ({ ...t, updated: relativeTime(Date.now()) }));
          // First turn: persist the auto-title AND the project membership onto the
          // thread (the memory option seeds the title but not metadata). This is
          // when a thread created inside a project gets its `projectId` written.
          if (isFirst && title) {
            void updateThreadMeta(threadId, { title, projectId }).catch(() => {});
          }
          // Record a recallable one-line summary of this thread (v1.3). Best-effort.
          if (answerText.trim()) {
            void saveThreadSummary(
              threadId,
              title ?? trimmed,
              answerText.trim().slice(0, 400),
            ).catch(() => {});
          }
        }
      } catch (err) {
        if (!aborted) {
          const message = err instanceof Error ? err.message : String(err);
          patchAssistant(threadId, assistantId, (m) => ({
            ...m,
            status: 'error',
            errorText: message,
            finishedAt: Date.now(),
          }));
        }
      } finally {
        stopRef.current = null;
      }
    },
    [threads, patchThread, patchAssistant],
  );

  return {
    threads,
    listLoading,
    listError,
    loadMessages,
    refreshList,
    createThread,
    renameThread,
    removeThread,
    moveThreadToProject,
    sendMessage,
    stop,
  };
}
