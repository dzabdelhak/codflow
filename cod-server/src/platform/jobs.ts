import { randomUUID } from "node:crypto";
import type pg from "pg";
import { sql } from "drizzle-orm";
import type { AppDb } from "../../../cod-shared/db/client";
import { jobs } from "../../../cod-shared/db/schema";

export interface Job<P = unknown> {
  id: string;
  kind: string;
  storeId: string | null;
  payload: P;
  attempts: number;
  maxAttempts: number;
  dedupKey: string | null;
}

export class PermanentJobError extends Error {}

export type JobHandler = (job: Job) => Promise<unknown>;

export interface EnqueueInput {
  kind: string;
  payload: unknown;
  dedupKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueueJob(db: AppDb, input: EnqueueInput): Promise<string | null> {
  const rows = await db
    .insert(jobs)
    .values({
      id: randomUUID(),
      kind: input.kind,
      payload: input.payload,
      dedupKey: input.dedupKey ?? null,
      runAt: input.runAt ?? sql`now()`,
      ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
    })
    .onConflictDoNothing({ target: jobs.dedupKey })
    .returning({ id: jobs.id });
  return rows[0]?.id ?? null;
}

export function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

export async function claimJobs(
  platform: pg.Pool,
  kinds: string[],
  { limit = 10, lockMs = 5 * 60 * 1000 }: { limit?: number; lockMs?: number } = {},
): Promise<Job[]> {
  const { rows } = await platform.query<Job>(
    `update jobs j
        set status = 'running', attempts = j.attempts + 1,
            locked_until = now() + make_interval(secs => $3::double precision / 1000)
      where j.id in (
        select id from jobs
         where kind = any($1)
           and ((status = 'pending' and run_at <= now()) or (status = 'running' and locked_until < now()))
         order by run_at
         limit $2
         for update skip locked)
      returning j.id, j.kind, j.store_id as "storeId", j.payload, j.attempts,
                j.max_attempts as "maxAttempts", j.dedup_key as "dedupKey"`,
    [kinds, limit, lockMs],
  );
  return rows;
}

export async function completeJob(platform: pg.Pool, id: string, result: unknown): Promise<void> {
  await platform.query(
    `update jobs set status = 'done', result = $2, last_error = null, locked_until = null, finished_at = now()
      where id = $1`,
    [id, JSON.stringify(result ?? null)],
  );
}

export async function failJob(platform: pg.Pool, job: Job, error: unknown): Promise<"retry" | "failed"> {
  const message = error instanceof Error ? error.message : String(error);
  const permanent = error instanceof PermanentJobError || job.attempts >= job.maxAttempts;
  if (permanent) {
    await platform.query(
      `update jobs set status = 'failed', last_error = $2, locked_until = null, finished_at = now() where id = $1`,
      [job.id, message],
    );
    return "failed";
  }
  await platform.query(
    `update jobs set status = 'pending', last_error = $2, locked_until = null,
            run_at = now() + make_interval(secs => $3::double precision / 1000)
      where id = $1`,
    [job.id, message, retryDelayMs(job.attempts)],
  );
  return "retry";
}

export async function runDueJobs(
  platform: pg.Pool,
  handlers: Record<string, JobHandler>,
  options: { limit?: number; lockMs?: number } = {},
): Promise<number> {
  const claimed = await claimJobs(platform, Object.keys(handlers), options);
  await Promise.all(
    claimed.map(async (job) => {
      try {
        await completeJob(platform, job.id, await handlers[job.kind](job));
      } catch (err) {
        if (await failJob(platform, job, err) === "failed") {
          console.error(`[jobs] ${job.kind} ${job.id} failed:`, err instanceof Error ? err.message : err);
        }
      }
    }),
  );
  return claimed.length;
}

export function startJobWorker(
  platform: pg.Pool,
  handlers: Record<string, JobHandler>,
  { intervalMs = 2000 }: { intervalMs?: number } = {},
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      while ((await runDueJobs(platform, handlers)) > 0);
    } catch (err) {
      console.error("[jobs] worker tick failed:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
