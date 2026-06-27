import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export type CurrentDatetime = {
  iso: string;
  date: string;
  time: string;
  weekday: string;
  timezone: string;
  unixMs: number;
};

/** Pure formatter (testable): project a Date into the tool's output shape. */
export function currentDatetime(now: Date = new Date()): CurrentDatetime {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    iso: now.toISOString(),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    unixMs: now.getTime(),
  };
}

/**
 * `get_current_datetime` (Hex `GetCurrentDateTime`) — the agent's clock. Relative
 * date reasoning ("last 30 days", "this quarter", "year to date") needs a fixed
 * "now"; without it the model guesses a date from training data. Pure helper, no
 * I/O — it just reads the server clock.
 */
export const getCurrentDatetimeTool = createTool({
  id: 'GetCurrentDateTime',
  description:
    'Get the current date and time based on the timezone configured for the server (the workspace ' +
    'default). Call this before any relative-date analysis — "last 30 days", "this month", "year to ' +
    'date", "yesterday" — so you anchor the window to the real today instead of guessing. Returns ' +
    'ISO date/time, the weekday, and the timezone.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    iso: z.string().describe('Full ISO-8601 timestamp, e.g. 2026-06-25T14:03:00.000Z'),
    date: z.string().describe('Local calendar date, YYYY-MM-DD.'),
    time: z.string().describe('Local wall-clock time, HH:MM:SS.'),
    weekday: z.string().describe('Day of week, e.g. "Thursday".'),
    timezone: z.string().describe('IANA timezone of the server, e.g. "America/Los_Angeles".'),
    unixMs: z.number().describe('Milliseconds since the Unix epoch.'),
  }),
  execute: async () => currentDatetime(),
});
