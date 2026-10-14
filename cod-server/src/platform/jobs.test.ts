import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type pg from "pg";
import { createPool } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { claimJobs, enqueueJob, PermanentJobError, runDueJobs } from "./jobs";

let harness: TestDb;
let platform: pg.Pool;

beforeAll(async () => {
  harness = await createTestDb();
  platform = createPool(harness.url, "codflow_platform");
}, 120_000);

afterAll(async () => {
  await platform?.end();
  await harness?.dispose();
});

beforeEach(async () => {
  await harness.platform.query("delete from jobs");
});

const row = async (id: string) =>
  (await harness.platform.query("select status, attempts, last_error, run_at > now() as later, result from jobs where id = $1", [id])).rows[0];

describe("the job queue", () => {
  it("enqueues inside the request's store, once per deduplication key", async () => {
    const first = await enqueueJob(harness.db, { kind: "t", payload: { n: 1 }, dedupKey: "same" });
    const second = await enqueueJob(harness.db, { kind: "t", payload: { n: 2 }, dedupKey: "same" });
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    const { rows } = await harness.platform.query("select store_id, payload from jobs");
    expect(rows).toEqual([{ store_id: harness.storeId, payload: { n: 1 } }]);
  });

  it("shows a store's request code only its own jobs", async () => {
    const other = await harness.createStore("jobs-other");
    await harness.platform.query("insert into jobs (id, kind, store_id, payload) values ('foreign', 't', $1, '{}')", [other]);
    await enqueueJob(harness.db, { kind: "t", payload: {} });
    const visible = await harness.db.execute("select id from jobs");
    expect(visible.rows.map((r) => r.id)).not.toContain("foreign");
    expect(visible.rows).toHaveLength(1);
  });

  it("completes a job its handler finishes, keeping the result", async () => {
    const id = (await enqueueJob(harness.db, { kind: "ok", payload: { n: 3 } }))!;
    const ran = await runDueJobs(platform, { ok: async (job) => ({ doubled: (job.payload as { n: number }).n * 2 }) });
    expect(ran).toBe(1);
    expect(await row(id)).toMatchObject({ status: "done", attempts: 1, result: { doubled: 6 } });
  });

  it("retries a failing job later, and gives up on a permanent error or after its last attempt", async () => {
    const retry = (await enqueueJob(harness.db, { kind: "flaky", payload: {} }))!;
    const permanent = (await enqueueJob(harness.db, { kind: "refused", payload: {} }))!;
    const last = (await enqueueJob(harness.db, { kind: "flaky", payload: {}, maxAttempts: 1 }))!;
    await runDueJobs(platform, {
      flaky: async () => {
        throw new Error("timeout");
      },
      refused: async () => {
        throw new PermanentJobError("400 bad pixel");
      },
    });
    expect(await row(retry)).toMatchObject({ status: "pending", attempts: 1, last_error: "timeout", later: true });
    expect(await row(permanent)).toMatchObject({ status: "failed", last_error: "400 bad pixel" });
    expect(await row(last)).toMatchObject({ status: "failed", attempts: 1 });
    expect(await runDueJobs(platform, { flaky: async () => null })).toBe(0);
  });

  it("never hands one job to two workers, and takes back a job whose worker died", async () => {
    for (let i = 0; i < 6; i++) await enqueueJob(harness.db, { kind: "t", payload: { i } });
    const [a, b] = await Promise.all([claimJobs(platform, ["t"], { limit: 4 }), claimJobs(platform, ["t"], { limit: 4 })]);
    const ids = [...a, ...b].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(6);

    expect(await claimJobs(platform, ["t"])).toHaveLength(0);
    await harness.platform.query("update jobs set locked_until = now() - interval '1 second'");
    const reclaimed = await claimJobs(platform, ["t"]);
    expect(reclaimed).toHaveLength(6);
    expect(reclaimed.every((j) => j.attempts === 2)).toBe(true);
  });
});
