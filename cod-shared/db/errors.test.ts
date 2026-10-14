import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { createProduct } from "../queries/products";
import { insertWebhookEvent } from "../queries/webhooks";
import { uniqueViolation, violatesUnique } from "./errors";

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
}, 120_000);

afterAll(async () => {
  await harness?.dispose();
});

const failure = (promise: Promise<unknown>) => promise.then(() => null, (err: unknown) => err);

describe("unique violations on PostgreSQL", () => {
  it("name the constraint a duplicate product handle or SKU broke, through Drizzle's wrapper", async () => {
    await createProduct(harness.db, { name: "Mug", handle: "mug", price: 1000, sku: "MUG-1" } as never);
    const sameHandle = await failure(createProduct(harness.db, { name: "Mug 2", handle: "mug", price: 1000, sku: "MUG-2" } as never));
    const sameSku = await failure(createProduct(harness.db, { name: "Mug 3", handle: "mug-3", price: 1000, sku: "MUG-1" } as never));

    expect(uniqueViolation(sameHandle)).toEqual({ constraint: "products_merchant_handle_unique" });
    expect(violatesUnique(sameSku, "products_merchant_sku_unique")).toBe(true);
    expect(uniqueViolation(new Error("UNIQUE constraint failed: products.handle"))).toBeNull();
  });

  it("let a carrier's retried webhook land as a duplicate instead of an error", async () => {
    await harness.db.execute(sql`insert into delivery_companies (id, name, name_ar, code, created_at, updated_at) values ('co-1', 'Yalidine', 'ياليدين', 'yalidine', now()::text, now()::text)`);
    const event = { provider: "yalidine", eventId: "evt-1", companyId: "co-1", eventType: "parcel_status_updated", rawPayload: "{}" };
    expect((await insertWebhookEvent(harness.db, event)).isDuplicate).toBe(false);
    expect((await insertWebhookEvent(harness.db, event)).isDuplicate).toBe(true);
  });
});
