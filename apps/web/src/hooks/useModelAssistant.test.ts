import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the `messages` argument every `semanticModelAgent.stream` call receives,
// plus the text-delta chunks the mocked stream replays back. Hoisted so the
// (hoisted) vi.mock factory can close over it.
const h = vi.hoisted(() => ({
  calls: [] as Array<Array<{ role: string; content: string }>>,
  reply: 'ok',
}));

vi.mock('@/lib/mastraClient', () => ({
  semanticModelAgent: {
    stream: async (messages: Array<{ role: string; content: string }>) => {
      h.calls.push(messages);
      return {
        body: { cancel() {} },
        processDataStream: async ({ onChunk }: { onChunk: (c: unknown) => void }) => {
          onChunk({ type: 'text-delta', payload: { text: h.reply } });
        },
      };
    },
  },
}));

import { useModelAssistant } from '@/hooks/useModelAssistant';

beforeEach(() => {
  h.calls = [];
  h.reply = 'ok';
});

describe('useModelAssistant.send', () => {
  it('always sends a non-empty messages array that includes the user turn', async () => {
    const { result } = renderHook(() => useModelAssistant({ onProposal: () => {} }));

    await act(async () => {
      await result.current.send('create a cube');
    });

    // Regression: the request must carry the user message — never `messages: []`,
    // which the provider rejects with 400 "at least one message is required".
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toEqual([{ role: 'user', content: 'create a cube' }]);
  });

  it('pins the agent to the bound non-builtin source by prefixing the first message', async () => {
    const { result } = renderHook(() =>
      useModelAssistant({
        onProposal: () => {},
        source: { id: 'ds-1', name: 'fay', dialect: 'postgres', builtin: false },
      }),
    );

    await act(async () => {
      await result.current.send('build a trades cube');
    });

    const sent = h.calls[0];
    // The user turn is preserved, but its content is prefixed with a preamble
    // that forces the bound dataConnectionId so the agent can't fall back to the
    // built-in warehouse (the bug: it read the sample DB's tables instead).
    expect(sent).toHaveLength(1);
    expect(sent[0].role).toBe('user');
    expect(sent[0].content).toContain('dataConnectionId "ds-1"');
    expect(sent[0].content).toContain('build a trades cube');
    // The displayed message stays clean (no preamble leaks into the UI).
    expect(result.current.messages[0].text).toBe('build a trades cube');
  });

  it('re-sends the full prior history (stateless) on a follow-up turn', async () => {
    h.reply = 'proposed it';
    const { result } = renderHook(() => useModelAssistant({ onProposal: () => {} }));

    await act(async () => {
      await result.current.send('first');
    });
    await act(async () => {
      await result.current.send('second');
    });

    expect(h.calls[1]).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'proposed it' },
      { role: 'user', content: 'second' },
    ]);
  });
});
