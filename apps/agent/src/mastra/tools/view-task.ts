import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getTask, listTasks } from '../db/tasks';

/**
 * `view_task` (Hex `ViewTask`) — inspect scheduled tasks: call with no argument to
 * list them, or with a `taskId` to see one task's schedule, alert, and last run
 * (status, value, time). Read-only.
 */
export const viewTaskTool = createTool({
  id: 'view_task',
  description:
    'View scheduled tasks. Call with no argument to list all tasks (name, cron, enabled, last status); ' +
    "call with a taskId to see one task's full config and its most recent run (status, value, time).",
  inputSchema: z.object({
    taskId: z.string().optional().describe('A task id to inspect. Omit to list all tasks.'),
  }),
  outputSchema: z.object({
    tasks: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          cron: z.string(),
          enabled: z.boolean(),
          lastStatus: z.string().optional(),
          lastValue: z.number().nullable().optional(),
        }),
      )
      .optional(),
    task: z.any().optional(),
    found: z.boolean().optional(),
  }),
  execute: async (input) => {
    if (!input?.taskId) {
      const tasks = await listTasks();
      return {
        tasks: tasks.map((t) => ({
          id: t.id,
          name: t.name,
          cron: t.cron,
          enabled: t.enabled,
          lastStatus: t.lastStatus,
          lastValue: t.lastValue ?? null,
        })),
      };
    }
    const task = await getTask(input.taskId);
    if (!task) return { found: false };
    // Trim the heavy lastResult for the tool view.
    const { lastResult, ...rest } = task;
    void lastResult;
    return { found: true, task: { ...rest, lastRowCount: task.lastResult?.rowCount ?? null } };
  },
});
