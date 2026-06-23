import { useCallback, useEffect, useRef, useState } from 'react';
import { analystAgent } from '@/lib/mastraClient';
import {
  CREATOR,
  CREATOR_INITIAL,
  RESOURCE_ID,
  deleteThread as deleteThreadApi,
  listThreads,
  loadThreadMessages,
  newThreadId,
  relativeTime,
  renameThread as renameThreadApi,
  titleFromText,
} from '@/lib/threads';
import type { AssistantMessage, ChatMessage, Thread, ToolStep } from '@/types';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const ACTIVE_KEY = 'dex.activeThreadId';
const readActive = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};
const writeActive = (id: string | null) => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage unavailable (private mode) — selection just won't persist */
  }
};

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Stop handler for the in-flight stream (one at a time — the composer is
  // disabled while streaming).
  const stopRef = useRef<(() => void) | null>(null);
  const didInit = useRef(false);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

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
    void (async () => {
      const loaded = await refreshList();
      const saved = readActive();
      if (saved && loaded.some((t) => t.id === saved)) {
        setActiveIdState(saved);
        void loadMessages(saved);
      }
    })();
  }, [refreshList, loadMessages]);

  const setActiveId = useCallback(
    (id: string | null) => {
      setActiveIdState(id);
      writeActive(id);
      if (!id) return;
      // Hydrate history the first time a thread is opened.
      setThreads((prev) => {
        const t = prev.find((x) => x.id === id);
        if (t && !t.messagesLoaded && !t.loadingMessages) void loadMessages(id);
        return prev;
      });
    },
    [loadMessages],
  );

  const createThread = useCallback((): string => {
    const id = newThreadId();
    const now = Date.now();
    const thread: Thread = {
      id,
      title: 'New thread',
      updated: 'just now',
      updatedAt: now,
      creator: CREATOR,
      initial: CREATOR_INITIAL,
      messages: [],
      messagesLoaded: true, // brand new — nothing to load from the store yet
    };
    setThreads((prev) => [thread, ...prev]);
    setActiveIdState(id);
    writeActive(id);
    return id;
  }, []);

  const renameThread = useCallback(
    (threadId: string, rawTitle: string) => {
      const title = rawTitle.trim();
      if (!title) return;
      patchThread(threadId, (t) => ({ ...t, title }));
      void renameThreadApi(threadId, title).catch((err) => {
        console.error('Failed to rename thread', err);
      });
    },
    [patchThread],
  );

  const removeThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setActiveIdState((cur) => {
      if (cur === threadId) {
        writeActive(null);
        return null;
      }
      return cur;
    });
    void deleteThreadApi(threadId).catch((err) => {
      console.error('Failed to delete thread', err);
    });
  }, []);

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
        updated: 'just now',
        updatedAt: Date.now(),
        messages: [...t.messages, userMsg, assistantMsg],
      }));

      // --- abortable streaming (soft stop) ---
      let aborted = false;
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
          // Belt-and-suspenders: make sure the persisted thread carries the
          // auto-title even if the memory option didn't seed it.
          if (isFirst && title) {
            void renameThreadApi(threadId, title).catch(() => {});
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
    activeId,
    activeThread,
    listLoading,
    listError,
    setActiveId,
    refreshList,
    createThread,
    renameThread,
    removeThread,
    sendMessage,
    stop,
  };
}
