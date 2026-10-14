import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { JobHandler } from "./jobs";

export interface ScheduledTask {
  kind: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

export function taskPeriodKey(task: Pick<ScheduledTask, "kind" | "everyMs">, now: number): string {
  return `${task.kind}:${Math.floor(now / task.everyMs)}`;
}

export async function enqueueDueTasks(platform: pg.Pool, tasks: ScheduledTask[], now = Date.now()): Promise<number> {
  let enqueued = 0;
  for (const task of tasks) {
    const { rowCount } = await platform.query(
      `insert into jobs (id, kind, payload, dedup_key, max_attempts)
       values ($1, $2, '{}'::jsonb, $3, 3)
       on conflict (dedup_key) do nothing`,
      [randomUUID(), task.kind, taskPeriodKey(task, now)],
    );
    enqueued += rowCount ?? 0;
  }
  return enqueued;
}

export function scheduledTaskHandlers(tasks: ScheduledTask[]): Record<string, JobHandler> {
  return Object.fromEntries(tasks.map((task) => [task.kind, () => task.run()]));
}

export function startScheduler(platform: pg.Pool, tasks: ScheduledTask[], { tickMs = 60_000 }: { tickMs?: number } = {}): () => void {
  const tick = () => void enqueueDueTasks(platform, tasks).catch((err) => console.error("[schedule] enqueue failed:", err instanceof Error ? err.message : err));
  const timer = setInterval(tick, tickMs);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
