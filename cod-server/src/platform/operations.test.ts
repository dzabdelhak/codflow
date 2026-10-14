import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type pg from "pg";
import { createPool } from "@/db/scope";
import { createTestDb, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import * as schema from "@/db/schema";
import { ulid } from "../../../cod-shared/lib/ulid";
import { runDueJobs } from "./jobs";
import { enqueueDueTasks, scheduledTaskHandlers, type ScheduledTask } from "./schedule";
import { certificateVerdict, checkDomainCertificates } from "./domain-certificates";
import { platformStatus } from "./status";
import type { CertificateStatus } from "./tls-probe";

let harness: TestDb;
let platform: pg.Pool;
const HOUR = 3600 * 1000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

beforeAll(async () => {
  harness = await createTestDb();
  platform = createPool(harness.url, "codflow_platform", 4);
}, 120_000);

afterAll(async () => {
  await platform?.end();
  await harness?.dispose();
});

beforeEach(async () => {
  await harness.platform.query("delete from jobs");
  await harness.platform.query("delete from outbound_orders");
  await harness.platform.query("delete from store_domains");
});

describe("scheduled tasks", () => {
  it("run once per period however many servers schedule them", async () => {
    let runs = 0;
    const tasks: ScheduledTask[] = [{ kind: "task:test", everyMs: HOUR, run: async () => ++runs }];
    const now = Date.now();

    await Promise.all([enqueueDueTasks(platform, tasks, now), enqueueDueTasks(platform, tasks, now), enqueueDueTasks(platform, tasks, now + 1000)]);
    await Promise.all([runDueJobs(platform, scheduledTaskHandlers(tasks)), runDueJobs(platform, scheduledTaskHandlers(tasks))]);
    expect(runs).toBe(1);

    await enqueueDueTasks(platform, tasks, now + HOUR);
    await runDueJobs(platform, scheduledTaskHandlers(tasks));
    expect(runs).toBe(2);
    const { rows } = await harness.platform.query("select status, result from jobs where kind = 'task:test' order by created_at");
    expect(rows).toEqual([{ status: "done", result: 1 }, { status: "done", result: 2 }]);
  });
});

describe("certificate checks", () => {
  const active = (days: number, trusted = true): CertificateStatus => ({
    status: "active", trusted, issuer: "Let's Encrypt", validTo: new Date(Date.now() + days * 24 * HOUR).toISOString(),
  });

  it("judge a certificate missing, untrusted or about to expire", () => {
    expect(certificateVerdict(active(60), { requireTrusted: true })).toEqual({ status: "active", error: null });
    expect(certificateVerdict(active(3), { requireTrusted: true }).status).toBe("expiring");
    expect(certificateVerdict(active(60, false), { requireTrusted: true }).status).toBe("error");
    expect(certificateVerdict(active(60, false), { requireTrusted: false }).status).toBe("active");
    expect(certificateVerdict({ status: "missing" }, { requireTrusted: true }).status).toBe("missing");
  });

  it("record each verified domain's certificate, and the status turns red once a failure outlives the grace hour", async () => {
    const insert = (hostname: string, status: string, verifiedAt: string | null, primary = false) =>
      harness.platform.query(
        "insert into store_domains (hostname, store_id, kind, created_at, status, verified_at, is_primary) values ($1, $2, 'custom', $3, $4, $5, $6)",
        [hostname, TEST_STORE_ID, iso(3 * HOUR), status, verifiedAt, primary],
      );
    await insert("good.dz", "verified", iso(3 * HOUR), true);
    await insert("broken.dz", "verified", iso(3 * HOUR));
    await insert("fresh.dz", "verified", iso(60 * 1000));
    await insert("pending.dz", "pending", null);

    expect((await platformStatus(platform)).checks.certificates.failing.map((f) => f.hostname)).toEqual(["broken.dz", "good.dz"]);

    const probed: string[] = [];
    const probe = async (hostname: string): Promise<CertificateStatus> => {
      probed.push(hostname);
      return hostname === "good.dz" ? active(60) : { status: "missing" };
    };
    expect(await checkDomainCertificates(platform, probe, { requireTrusted: true })).toEqual({ checked: 3, failing: 2 });
    expect(probed.sort()).toEqual(["broken.dz", "fresh.dz", "good.dz"]);

    const { rows } = await harness.platform.query("select hostname, certificate_status, certificate_error, certificate_checked_at from store_domains order by hostname");
    expect(rows.map((r) => [r.hostname, r.certificate_status])).toEqual([
      ["broken.dz", "missing"], ["fresh.dz", "missing"], ["good.dz", "active"], ["pending.dz", null],
    ]);
    expect(rows.find((r) => r.hostname === "good.dz").certificate_checked_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);

    const status = await platformStatus(platform);
    expect(status.ok).toBe(false);
    expect(status.checks.certificates.failing).toEqual([{ hostname: "broken.dz", status: "missing", error: "no certificate is served for this hostname" }]);
  });
});

describe("platform status", () => {
  it("is green on a healthy platform and red with an order waiting more than 24 hours", async () => {
    const healthy = await platformStatus(platform);
    expect(healthy).toMatchObject({ ok: true, checks: { database: { ok: true }, outbound: { ok: true, waiting: 0 }, jobs: { ok: true } } });

    const db = await harness.connect();
    const now = new Date().toISOString();
    await db.insert(schema.customers).values({ id: "c-status", name: "Test", phone: "0550999999", wilaya: "Alger", createdAt: now });
    await db.insert(schema.orders).values({
      id: "o-status", orderNumber: "S-1", customerId: "c-status", customerName: "Test", phone: "0550999999",
      price: 1000, deliveryFee: 0, createdAt: now, updatedAt: now,
    });
    const sendId = ulid();
    await db.insert(schema.outboundOrders).values({ id: sendId, orderId: "o-status", payload: {} });
    expect((await platformStatus(platform)).checks.outbound).toMatchObject({ ok: true, waiting: 1, stale: 0 });

    await harness.platform.query("update outbound_orders set queued_at = now() - interval '25 hours' where id = $1", [sendId]);
    const stale = await platformStatus(platform);
    expect(stale.ok).toBe(false);
    expect(stale.checks.outbound).toMatchObject({ ok: false, waiting: 1, stale: 1, oldestWaitingMinutes: 1500 });

    await harness.platform.query("insert into jobs (id, kind, payload, run_at) values ('j-late', 'conversion', '{}'::jsonb, now() - interval '45 minutes')");
    expect((await platformStatus(platform)).checks.jobs).toMatchObject({ ok: false, due: 1, oldestDueMinutes: 45 });
  });
});
