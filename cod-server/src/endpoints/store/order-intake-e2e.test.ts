/**
 * Taking a storefront order on PostgreSQL (ticket 02, Aventy guide §1, §5, §6):
 * every valid order is recorded with its outbound queue entry, numbered per
 * channel, and taken even when stock or the delivery fee is uncertain.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import type { AppContext } from "@/types";
import { createPool, requestScope, type Database } from "@/db/scope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import { createTestDb, TEST_MERCHANT_ID, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import * as schema from "@/db/schema";
import storeRouter from "./routes";

let harness: TestDb;
const NOW = () => new Date().toISOString();
const WILAYA = 16;
const COMMUNE_ID = "c-16-001";
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** The storefront order route behind the real request scope: one pooled connection and transaction per request. */
function scopedApp(database: Database) {
  const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
  app.use("*", async (c, next) => {
    c.env = { DATABASE: database } as never;
    await next();
  });
  app.use("*", requestScope(async () => ({ storeId: TEST_STORE_ID, merchantId: TEST_MERCHANT_ID })));
  app.onError(errorHandler);
  app.route("/store", storeRouter);
  return app;
}

let app: OpenAPIHono<AppContext>;
let database: Database;

function order(body: Record<string, unknown> = {}) {
  return app.request("/store/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "intake-test" },
    body: JSON.stringify({
      customerName: "Amina Test",
      phone: "0550123456",
      wilayaId: WILAYA,
      communeId: COMMUNE_ID,
      address: "Rue des tests",
      deliveryType: "home",
      productId: "p-shirt",
      productName: "Shirt",
      pricePerUnit: 2500,
      quantity: 1,
      ...body,
    }),
  });
}

async function queueRowFor(orderId: string) {
  return harness.db.select().from(schema.outboundOrders).where(eq(schema.outboundOrders.orderId, orderId)).then((r) => r[0]);
}

beforeAll(async () => {
  harness = await createTestDb();
  const appPool = createPool(harness.url, "codflow_app", 20);
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
  app = scopedApp(database);
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

beforeEach(async () => {
  for (const table of [schema.outboundOrders, schema.orderProducts, schema.orderStatusHistory, schema.stockMovements, schema.orders, schema.customers, schema.productVariants, schema.products, schema.shippingRules, schema.shippingProfiles]) {
    await harness.db.delete(table);
  }
  await harness.setStore({ name: "Nour", orderPrefix: "NOUR", createdAt: NOW(), updatedAt: NOW() });
  await harness.db.insert(schema.products).values([
    { id: "p-shirt", name: "Shirt", handle: "shirt", price: 2500, sku: "SHIRT", inventory: 10, createdAt: NOW(), updatedAt: NOW() },
    { id: "p-last", name: "Last one", handle: "last", price: 4000, sku: "LAST", inventory: 1, createdAt: NOW(), updatedAt: NOW() },
  ]);
  await harness.db.insert(schema.shippingProfiles).values({ id: "sp", name: "Default", isDefault: true, createdAt: NOW(), updatedAt: NOW() });
  await harness.db.insert(schema.shippingRules).values({
    id: "sr", profileId: "sp", wilayaId: WILAYA, homePrice: 400, stopDeskPrice: 250, homeEnabled: true, stopDeskEnabled: true, createdAt: NOW(),
  });
});

describe("order numbers", () => {
  it("are readable, prefixed by the channel and sequential", async () => {
    const first = (await (await order()).json()) as { data: { orderNumber: string } };
    const second = (await (await order({ phone: "0550123457" })).json()) as { data: { orderNumber: string } };
    expect(first.data.orderNumber).toMatch(/^NOUR-\d{5}$/);
    expect(Number(second.data.orderNumber.slice(5))).toBe(Number(first.data.orderNumber.slice(5)) + 1);
  });

  it("never collide, even for orders placed at the same moment", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => order({ phone: `05501${String(i).padStart(5, "0")}` })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    const numbers = await Promise.all(results.map(async (r) => ((await r.json()) as { data: { orderNumber: string } }).data.orderNumber));
    expect(new Set(numbers).size).toBe(20);
  });
});

describe("the outbound queue", () => {
  it("records exactly one entry with a ULID send id and the guide §5.2 payload, with the order", async () => {
    const res = await order({ items: [
      { productId: "p-shirt", productName: "Shirt", quantity: 2 },
    ] });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { orderId: string; orderNumber: string } };

    const entry = await queueRowFor(data.orderId);
    expect(entry?.id).toMatch(ULID);
    expect(entry?.status).toBe("pending");
    expect(entry?.payload).toMatchObject({
      sendId: entry?.id,
      reference: data.orderNumber,
      lines: [{ sku: "SHIRT", quantity: 2, unitPrice: 2500, catalogVersion: null }],
      delivery: { type: "home", fee: 400, feeToConfirm: false, office: null, gridVersion: null },
      customer: { name: "Amina Test", phone: "0550123456", wilayaId: WILAYA, communeId: COMMUNE_ID, address: "Rue des tests" },
      journey: { kind: "cart", campaign: null },
      stockNotGuaranteed: false,
      traces: { userAgent: "intake-test", deviceId: null },
    });
  });

  it("calls a single-product checkout a direct purchase", async () => {
    const { data } = (await (await order()).json()) as { data: { orderId: string } };
    expect((await queueRowFor(data.orderId))?.payload).toMatchObject({ journey: { kind: "direct" } });
  });

  it("is never left behind by an order that failed, nor leaves an order without it", async () => {
    const before = (await harness.db.select().from(schema.orders)).length;
    const res = await order({ productId: "p-missing", productName: "Ghost" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await harness.db.select().from(schema.orders)).toHaveLength(before);
    expect(await harness.db.select().from(schema.outboundOrders)).toHaveLength(before);
  });
});

describe("never refused for an uncertain delivery fee (guide rule 3)", () => {
  it("takes the order with the fee to confirm when the wilaya has no delivery rule — never 0 DA", async () => {
    const res = await order({ wilayaId: 1, communeId: "c-01-001" });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { orderId: string; deliveryFee: number | null; feeToConfirm: boolean; total: number; price: number } };
    expect(data).toMatchObject({ deliveryFee: null, feeToConfirm: true, total: data.price });

    const row = await harness.db.select().from(schema.orders).where(eq(schema.orders.id, data.orderId)).then((r) => r[0]);
    expect(row?.deliveryFeeToConfirm).toBe(true);
    expect((await queueRowFor(data.orderId))?.payload).toMatchObject({ delivery: { fee: null, feeToConfirm: true } });
  });
});

describe("never refused for uncertain stock (guide rule 1, §6)", () => {
  it("takes an order beyond the stock on hand, marked not guaranteed, without driving stock negative", async () => {
    const res = await order({ productId: "p-last", productName: "Last one", quantity: 3 });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { orderId: string; stockConfirmed: boolean } };
    expect(data.stockConfirmed).toBe(false);

    const product = await harness.db.select().from(schema.products).where(eq(schema.products.id, "p-last")).then((r) => r[0]);
    expect(product?.inventory).toBe(1);
    const row = await harness.db.select().from(schema.orders).where(eq(schema.orders.id, data.orderId)).then((r) => r[0]);
    expect(row?.stockConfirmed).toBe(false);
    expect((await queueRowFor(data.orderId))?.payload).toMatchObject({ stockNotGuaranteed: true });
  });

  it("still deducts the lines stock can cover in the same basket", async () => {
    const res = await order({ items: [
      { productId: "p-shirt", productName: "Shirt", quantity: 2 },
      { productId: "p-last", productName: "Last one", quantity: 5 },
    ] });
    expect(res.status).toBe(201);
    const inventory = Object.fromEntries(
      (await harness.db.select({ id: schema.products.id, inventory: schema.products.inventory }).from(schema.products)).map((p) => [p.id, p.inventory]),
    );
    expect(inventory).toEqual({ "p-shirt": 8, "p-last": 1 });
  });

  it("confirms stock when every line is covered", async () => {
    const { data } = (await (await order({ quantity: 2 })).json()) as { data: { stockConfirmed: boolean } };
    expect(data.stockConfirmed).toBe(true);
  });
});
