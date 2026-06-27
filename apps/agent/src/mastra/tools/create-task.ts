import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { assertReadOnly } from '../db/guard';
import { isValidCron } from '../db/cron';
import { createTask } from '../db/tasks';

/**
 * `create_task` (Hex `CreateTask`) — schedule a read-only query to re-run on a
 * cron, optionally alert when a scalar crosses a threshold (or changes), and
 * deliver a summary (Slack/webhook). The query runs through the same read-only
 * guard as everything else. Confirm the schedule with the user before creating it.
 */
export const createTaskTool = createTool({
  id: 'CreateTask',
  description:
    'Create a scheduled task that re-runs a read-only SQL query on a cadence and delivers the result ' +
    '(optionally alerting when a value crosses a threshold or changes). Use this when the user wants a ' +
    'recurring or monitored number ("every weekday morning", "alert me if completed revenue drops ' +
    'below Y"). The cron is a standard 5-field expression (min hour day month weekday). Confirm the ' +
    "schedule, query, and any alert with the user first. Re-runs go through Dex's read-only guard.",
  inputSchema: z.object({
    name: z.string().describe('A short name for the task.'),
    sql: z.string().describe('The read-only SQL to re-run (SELECT / WITH only).'),
    cron: z.string().describe('5-field cron, e.g. "0 9 * * 1-5" for 9am on weekdays.'),
    alert: z
      .object({
        column: z.string().optional().describe('Result column to watch (else first numeric cell).'),
        op: z.enum(['gt', 'lt', 'ne', 'changed']),
        threshold: z.number().optional().describe('Threshold for gt/lt/ne.'),
      })
      .optional()
      .describe('Optional alert condition.'),
    delivery: z
      .object({
        channel: z.enum(['none', 'slack', 'webhook']),
        url: z.string().optional(),
      })
      .optional()
      .describe(
        'Where to deliver a summary (default none; alerts always deliver if a URL is set).',
      ),
  }),
  outputSchema: z.object({
    created: z.boolean(),
    taskId: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    if (!isValidCron(input.cron)) {
      return { created: false, error: `Invalid cron expression: "${input.cron}".` };
    }
    try {
      assertReadOnly(input.sql);
    } catch (err) {
      return { created: false, error: err instanceof Error ? err.message : String(err) };
    }
    const task = await createTask({
      name: input.name,
      kind: 'sql',
      sql: input.sql,
      cron: input.cron,
      alert: input.alert ?? null,
      delivery: input.delivery ?? { channel: 'none' },
    });
    return { created: true, taskId: task.id };
  },
});
