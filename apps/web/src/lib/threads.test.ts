import { describe, expect, it } from 'vitest';
import { reconstructMessages } from '@/lib/threads';
import type { AssistantMessage } from '@/types';

// Minimal stored-message shape (matches Mastra's persisted parts).
const userMsg = (text: string, createdAt: string) => ({
  role: 'user',
  createdAt,
  content: { parts: [{ type: 'text', text }] },
});

const assistantMsg = (text: string, createdAt: string) => ({
  role: 'assistant',
  createdAt,
  content: { parts: [{ type: 'text', text }] },
});

describe('reconstructMessages — thinking elapsed time', () => {
  it('anchors startedAt to the preceding user message so elapsed is non-zero', () => {
    // The whole assistant turn is persisted as ONE message: its createdAt is the
    // finish time. Without the user anchor, startedAt === finishedAt → 0s.
    const out = reconstructMessages([
      userMsg('how many orders?', '2026-06-29T10:00:00.000Z'),
      assistantMsg('42 orders.', '2026-06-29T10:00:07.000Z'),
    ]);

    const assistant = out.find((m) => m.role === 'assistant') as AssistantMessage;
    expect(assistant).toBeTruthy();
    expect(assistant.startedAt).toBe(Date.parse('2026-06-29T10:00:00.000Z'));
    expect(assistant.finishedAt).toBe(Date.parse('2026-06-29T10:00:07.000Z'));
    // 7s worked — the elapsed label would now render a real value, not 0.
    expect((assistant.finishedAt! - assistant.startedAt) / 1000).toBe(7);
  });

  it('falls back to the assistant time when the user timestamp is not earlier', () => {
    // Defensive: if the user-message time isn't actually before the assistant's
    // (e.g. a missing createdAt resolved to "now"), don't produce a bogus/negative
    // span — anchor to the assistant time, preserving the old behaviour.
    const at = '2026-06-29T10:00:00.000Z';
    const out = reconstructMessages([
      userMsg('q', '2026-06-29T10:05:00.000Z'), // later than the assistant time
      assistantMsg('a', at),
    ]);
    const assistant = out.find((m) => m.role === 'assistant') as AssistantMessage;
    expect(assistant.startedAt).toBe(Date.parse(at));
    expect(assistant.finishedAt).toBe(Date.parse(at));
  });

  it('uses each turn’s own user message as the anchor across multiple turns', () => {
    const out = reconstructMessages([
      userMsg('q1', '2026-06-29T10:00:00.000Z'),
      assistantMsg('a1', '2026-06-29T10:00:05.000Z'),
      userMsg('q2', '2026-06-29T10:01:00.000Z'),
      assistantMsg('a2', '2026-06-29T10:01:03.000Z'),
    ]);
    const assistants = out.filter((m) => m.role === 'assistant') as AssistantMessage[];
    expect(assistants).toHaveLength(2);
    expect((assistants[0].finishedAt! - assistants[0].startedAt) / 1000).toBe(5);
    expect((assistants[1].finishedAt! - assistants[1].startedAt) / 1000).toBe(3);
  });
});
