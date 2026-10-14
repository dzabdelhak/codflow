import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type pg from "pg";
import { Client as PgClient } from "pg";
import { createPool } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import * as schema from "@/db/schema";
import { ulid } from "../../../../cod-shared/lib/ulid";
import { drainOutbound, outboundDelayMs, raiseOutboundAlerts, sendNextOutbound } from "./worker";
import type { DestinationAnswer, OrderDestination, OutboundEntry } from "./destination";

let harness: TestDb;
let platform: pg.Pool;
let other: string;
let seq = 0;

async function enqueue(storeId: string, count: number): Promise<string[]> {
  const db = await harness.connect(storeId);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = ++seq;
    const now = new Date().toISOString();
    await db.insert(schema.customers).values({ id: `c-${n}`, name: "Test", phone: `0550${String(n).padStart(6, "0")}`, wilaya: "Alger", createdAt: now });
    await db.insert(schema.orders).values({
      id: `o-${n}`, orderNumber: `T-${n}`, customerId: `c-${n}`, customerName: "Test", phone: `0550${String(n).padStart(6, "0")}`,
      price: 1000, deliveryFee: 0, createdAt: now, updatedAt: now,
    });
    const id = ulid();
    await db.insert(schema.outboundOrders).values({ id, orderId: `o-${n}`, payload: { reference: `T-${n}` } });
    ids.push(id);
  }
  return ids;
}

const rows = async () =>
  (await harness.platform.query("select id, store_id, status, attempts, last_outcome, aventy_order_id, outcome_detail, last_error from outbound_orders order by created_at, id")).rows;

const makeDue = () => harness.platform.query("update outbound_orders set next_attempt_at = now() where status = 'pending'");

function recordingDestination(answer: (entry: OutboundEntry, seen: number) => DestinationAnswer | Promise<DestinationAnswer>) {
  const received = new Map<string, number>();
  const accepted = new Map<string, number>();
  const order: string[] = [];
  const inFlight = new Set<string>();
  let overlap = false;
  const destination: OrderDestination = {
    name: "recording",
    async send(entry) {
      if (inFlight.has(entry.sendId)) overlap = true;
      inFlight.add(entry.sendId);
      try {
        const seen = (received.get(entry.sendId) ?? 0) + 1;
        received.set(entry.sendId, seen);
        await new Promise((r) => setTimeout(r, 2));
        const result = await answer(entry, seen);
        if (result.kind === "accepted") {
          accepted.set(entry.sendId, (accepted.get(entry.sendId) ?? 0) + 1);
          order.push(entry.sendId);
        }
        return result;
      } finally {
        inFlight.delete(entry.sendId);
      }
    },
  };
  return { destination, received, accepted, order, overlapped: () => overlap };
}

beforeAll(async () => {
  harness = await createTestDb();
  other = await harness.createStore("outbound-other");
  platform = createPool(harness.url, "codflow_platform", 12);
}, 120_000);

afterAll(async () => {
  await platform?.end();
  await harness?.dispose();
});

beforeEach(async () => {
  await harness.platform.query("delete from outbound_orders");
});

describe("the outbound worker", () => {
  it("delivers every order exactly once, by one server at a time, in each channel's creation order, with the destination failing 30% of the time", async () => {
    const mine = await enqueue(harness.storeId, 20);
    const theirs = await enqueue(other, 20);
    let calls = 0;
    const remembered = new Map<string, string>();
    const { destination, accepted, order, overlapped } = recordingDestination((entry) => {
      calls++;
      if (calls % 10 < 3) return calls % 2 ? { kind: "retry", reason: "busy" } : Promise.reject(new Error("socket hang up"));
      if (remembered.has(entry.sendId)) return { kind: "duplicate", remoteId: remembered.get(entry.sendId)! };
      remembered.set(entry.sendId, `AV-${entry.sendId}`);
      return { kind: "accepted", remoteId: `AV-${entry.sendId}` };
    });

    for (let round = 0; round < 40 && (await rows()).some((r) => r.status === "pending"); round++) {
      await Promise.all(Array.from({ length: 4 }, () => drainOutbound(platform, destination)));
      await makeDue();
    }

    const final = await rows();
    expect(final.every((r) => r.status === "sent")).toBe(true);
    expect([...accepted.values()].every((n) => n === 1)).toBe(true);
    expect(accepted.size).toBe(40);
    expect(overlapped()).toBe(false);
    expect(order.filter((id) => mine.includes(id))).toEqual(mine);
    expect(order.filter((id) => theirs.includes(id))).toEqual(theirs);
    expect(final.every((r) => r.aventy_order_id === `AV-${r.id}`)).toBe(true);
  });

  it("leaves an order whose server died mid-send to be resent, and the send id deduplicates it", async () => {
    const [sendId] = await enqueue(harness.storeId, 1);
    let release: () => void = () => {};
    const hanging = new Promise<void>((resolve) => (release = resolve));
    const first = recordingDestination(async () => {
      await hanging;
      return { kind: "accepted", remoteId: "AV-1" };
    });
    const dying = sendNextOutbound(platform, first.destination).catch((err: Error) => err);
    await vi.waitFor(() => expect(first.received.get(sendId)).toBe(1));

    const admin = new PgClient({ connectionString: harness.url });
    await admin.connect();
    const { rows: killed } = await admin.query(
      "select pg_terminate_backend(pid) as ok from pg_stat_activity where datname = current_database() and state = 'idle in transaction' and pid <> pg_backend_pid()",
    );
    await admin.end();
    expect(killed).toHaveLength(1);
    release();
    expect(await dying).toBeInstanceOf(Error);
    expect((await rows())[0]).toMatchObject({ status: "pending" });

    const second = recordingDestination(() => ({ kind: "duplicate", remoteId: "AV-1" }));
    await drainOutbound(platform, second.destination);
    expect(second.received.get(sendId)).toBe(1);
    expect((await rows())[0]).toMatchObject({ status: "sent", last_outcome: "duplicate", aventy_order_id: "AV-1" });
  });

  it("holds a channel's newer orders behind an older one that is waiting to retry", async () => {
    const [head, next] = await enqueue(harness.storeId, 2);
    const [elsewhere] = await enqueue(other, 1);
    const { destination, received } = recordingDestination((entry) =>
      entry.sendId === head ? { kind: "retry", reason: "busy" } : { kind: "accepted", remoteId: `AV-${entry.sendId}` },
    );
    await drainOutbound(platform, destination);
    expect(received.has(head)).toBe(true);
    expect(received.has(next)).toBe(false);
    expect(received.has(elsewhere)).toBe(true);
  });

  it("marks an order sent only on an answer it recognises", async () => {
    await enqueue(harness.storeId, 1);
    const answers: unknown[] = [
      { kind: "accepted" },
      { status: "OK" },
      "fine",
      { kind: "review", remoteId: "AV-9", reasons: ["phone unusual"] },
    ];
    let i = 0;
    const destination: OrderDestination = { name: "odd", send: async () => answers[i++] as DestinationAnswer };
    for (let n = 0; n < 3; n++) {
      await sendNextOutbound(platform, destination);
      expect((await rows())[0]).toMatchObject({ status: "pending", last_outcome: "unknown" });
      await makeDue();
    }
    await sendNextOutbound(platform, destination);
    expect((await rows())[0]).toMatchObject({ status: "sent", last_outcome: "review", outcome_detail: { reasons: ["phone unusual"] }, attempts: 4 });
  });

  it("never retries a rejected order, and keeps the fields at fault", async () => {
    await enqueue(harness.storeId, 1);
    const { destination, received } = recordingDestination(() => ({ kind: "rejected", fields: ["customer.phone"], message: "invalid phone" }));
    await drainOutbound(platform, destination);
    await makeDue();
    await drainOutbound(platform, destination);
    expect([...received.values()]).toEqual([1]);
    expect((await rows())[0]).toMatchObject({ status: "rejected", outcome_detail: { fields: ["customer.phone"] }, last_error: "invalid phone" });
  });

  it("waits longer after each failure, without ever giving up", () => {
    expect(outboundDelayMs(1)).toBe(15_000);
    expect(outboundDelayMs(2)).toBe(30_000);
    expect(outboundDelayMs(50)).toBe(60 * 60 * 1000);
  });

  it("alerts once for an order waiting more than 24 hours, logging no personal data", async () => {
    const [stale] = await enqueue(harness.storeId, 1);
    await enqueue(harness.storeId, 1);
    await harness.platform.query("update outbound_orders set created_at = now() - interval '25 hours' where id = $1", [stale]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await raiseOutboundAlerts(platform)).toBe(1);
    expect(await raiseOutboundAlerts(platform)).toBe(0);
    const line = JSON.parse(warn.mock.calls[0][0] as string);
    expect(line).toMatchObject({ event: "outbound.stale", sendId: stale, storeId: harness.storeId, ageHours: 25 });
    expect(JSON.stringify(line)).not.toMatch(/0550|Test/);
    warn.mockRestore();
  });
});
