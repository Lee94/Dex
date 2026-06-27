import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantMessage } from '@/types';

// Scripted Mastra chunks the mocked stream replays into useThreads. Hoisted so
// the vi.mock factory (also hoisted) can close over it.
const h = vi.hoisted(() => ({ chunks: [] as Array<{ type: string; payload: unknown }> }));

vi.mock('@/lib/mastraClient', () => ({
  analystAgent: {
    stream: async () => ({
      body: { cancel() {} },
      processDataStream: async ({ onChunk }: { onChunk: (c: unknown) => void }) => {
        for (const c of h.chunks) onChunk(c);
      },
    }),
  },
}));

vi.mock('@/lib/threads', () => ({
  CREATOR: 'You',
  CREATOR_INITIAL: 'Y',
  RESOURCE_ID: 'res',
  listThreads: vi.fn(async () => []),
  loadThreadMessages: vi.fn(async () => []),
  deleteThread: vi.fn(async () => {}),
  updateThreadMeta: vi.fn(async () => {}),
  newThreadId: vi.fn(() => 'thread-1'),
  relativeTime: vi.fn(() => 'just now'),
  titleFromText: vi.fn((t: string) => t.slice(0, 20)),
}));

import { useThreads } from '@/hooks/useThreads';
import { deleteThread, listThreads, updateThreadMeta } from '@/lib/threads';

beforeEach(() => {
  vi.clearAllMocks();
  h.chunks = [];
});

describe('useThreads stream mapping', () => {
  it('maps text-delta / tool-call / tool-result chunks onto thread state', async () => {
    h.chunks = [
      { type: 'text-delta', payload: { text: 'Hello ' } },
      { type: 'text-delta', payload: { text: 'world' } },
      {
        type: 'tool-call',
        payload: { toolCallId: 't1', toolName: 'RunSQL', args: { sql: 'SELECT 1' } },
      },
      {
        type: 'tool-result',
        payload: {
          toolCallId: 't1',
          result: { columns: ['n'], rows: [{ n: 1 }], rowCount: 1, truncated: false },
          isError: false,
        },
      },
    ];

    const { result } = renderHook(() => useThreads());
    await waitFor(() => expect(result.current.listLoading).toBe(false));

    let id = '';
    act(() => {
      id = result.current.createThread();
    });
    await act(async () => {
      await result.current.sendMessage(id, 'what is one');
    });

    const thread = result.current.threads.find((t) => t.id === id)!;
    const assistant = thread.messages.find((m) => m.role === 'assistant') as AssistantMessage;

    expect(thread.messages[0]).toMatchObject({ role: 'user', text: 'what is one' });
    expect(assistant.text).toBe('Hello world');
    expect(assistant.status).toBe('done');
    expect(assistant.steps).toHaveLength(1);
    expect(assistant.steps[0]).toMatchObject({ toolName: 'RunSQL', status: 'done' });
    expect(assistant.steps[0].result).toEqual({
      columns: ['n'],
      rows: [{ n: 1 }],
      rowCount: 1,
      truncated: false,
    });
  });

  it('marks the assistant message errored on an error chunk', async () => {
    h.chunks = [{ type: 'error', payload: { error: 'boom' } }];
    const { result } = renderHook(() => useThreads());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    let id = '';
    act(() => {
      id = result.current.createThread();
    });
    await act(async () => {
      await result.current.sendMessage(id, 'fail please');
    });
    const assistant = result.current.threads
      .find((t) => t.id === id)!
      .messages.find((m) => m.role === 'assistant') as AssistantMessage;
    expect(assistant.status).toBe('error');
    expect(assistant.errorText).toContain('boom');
  });
});

describe('useThreads persistence paths (v0.2)', () => {
  it('loads the thread list on mount', async () => {
    renderHook(() => useThreads());
    await waitFor(() => expect(listThreads).toHaveBeenCalled());
  });

  it('adopts an auto-title from the first message', async () => {
    const { result } = renderHook(() => useThreads());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    let id = '';
    act(() => {
      id = result.current.createThread();
    });
    await act(async () => {
      await result.current.sendMessage(id, 'monthly revenue by country');
    });
    expect(result.current.threads.find((t) => t.id === id)!.title).toBe('monthly revenue by c');
  });

  it('rename and delete call through to the store API', async () => {
    const { result } = renderHook(() => useThreads());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    let id = '';
    act(() => {
      id = result.current.createThread();
    });
    act(() => result.current.renameThread(id, 'Renamed'));
    expect(updateThreadMeta).toHaveBeenCalledWith(id, { title: 'Renamed', projectId: undefined });
    act(() => result.current.removeThread(id));
    expect(deleteThread).toHaveBeenCalledWith(id);
    expect(result.current.threads.find((t) => t.id === id)).toBeUndefined();
  });
});
