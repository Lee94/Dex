import { listTasks } from './tasks';
import { runTask } from './task-runner';
import { cronMatches } from './cron';

/**
 * The scheduler loop (v1.3). A lightweight in-process ticker: twice a minute it
 * checks enabled tasks and runs any whose cron matches the current minute (each
 * at most once per minute). Started from `index.ts` when the server boots (gated
 * by `DEX_SCHEDULER`); it `unref`s its timer so it never holds the process open.
 * Re-runs go through the read-only path in `task-runner.ts`.
 */

let timer: ReturnType<typeof setInterval> | null = null;
let lastMinuteKey = '';

async function tick(): Promise<void> {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}T${now.getHours()}:${now.getMinutes()}`;
  if (minuteKey === lastMinuteKey) return; // already handled this minute
  lastMinuteKey = minuteKey;
  try {
    const tasks = await listTasks();
    for (const task of tasks) {
      if (task.enabled && cronMatches(task.cron, now)) {
        await runTask(task);
      }
    }
  } catch {
    /* never let a bad tick kill the loop */
  }
}

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), 30_000);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
