/**
 * Checkout query budget — real-D1 E2E.
 *
 * D1 is a single-threaded Durable Object and bills by rows read, so a
 * duplicated row read is paid for twice and serialises the store's throughput
 * for its duration. The checkout path used to read the same `products` row up
 * to five times per order and the same `product_variants` row up to five times
 * when an offer fired.
 *
 * These tests count the SELECTs a real order placement issues, per table, and
 * cap them. They are a ratchet: the caps may come down as the path improves,
 * never up without a deliberate edit and a reason.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import {
  createStoreOrder,
  findOrCreateCustomer,
} from "../../../../cod-shared/queries/store";

let harness: TestDb;
let db: AppDb;
let sqlLog: string[] = [];

const WILAYA = 16;

/** SELECTs issued against one table. Writes are excluded. */
function selectsAgainst(table: string): string[] {
  const pattern = new RegExp(`\\bfrom\\s+"${table}"`, "i");
  return sqlLog.filter((q) => /^\s*select\b/i.test(q) && pattern.test(q));
}

beforeAll(async () => {
  harness = await createTestDb();
  // Every statement sent, including the ones inside a batch.
  harness.recordQueries((query) => sqlLog.push(query));
  db = harness.db;
});

// Child rows first: order lines and stock movements hold FKs onto products.
beforeEach(async () => {
  await db.delete(schema.orderProducts);
  await db.delete(schema.stockMovements);
  await db.delete(schema.orderStatusHistory);
  await db.delete(schema.orders);
  await db.delete(schema.offers);
  await db.delete(schema.productVariants);
  await db.delete(schema.products);
  sqlLog = [];
});

afterAll(async () => {
  await harness?.dispose();
});

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

async function seedProduct(overrides: Partial<typeof schema.products.$inferInsert> = {}) {
  const id = uid("prod");
  await db.insert(schema.products).values({
    id,
    name: "Budget Fixture",
    handle: `handle-${id}`,
    price: 1500,
    sku: `SKU-${id}`,
    hasVariants: false,
    inventory: 100,
    trackInventory: true,
    lowStockThreshold: 2,
    status: "ACTIVE",
    visibility: true,
    showInStore: true,
    storeFeatured: false,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });
  return id;
}

async function seedVariant(productId: string, overrides: Partial<typeof schema.productVariants.$inferInsert> = {}) {
  const id = uid("var");
  await db.insert(schema.productVariants).values({
    id,
    productId,
    variations: JSON.stringify({ Size: "M" }),
    price: 1800,
    sku: `VSKU-${id}`,
    inventory: 100,
    lowStockThreshold: 2,
    isDefault: true,
    active: true,
    position: 1,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });
  return id;
}

async function placeOrder(extra: Record<string, unknown>) {
  const customer = await findOrCreateCustomer(db, {
    phone: `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
    name: "Budget Buyer",
    wilayaId: WILAYA,
  });
  sqlLog = []; // measure the order placement only
  return createStoreOrder(db, {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    phone: customer.phone,
    wilayaId: WILAYA,
    communeId: null,
    deliveryType: "home",
    deliveryFee: 600,
    quantity: 1,
    pricePerUnit: 1500,
    ...extra,
  } as any);
}

describe("createStoreOrder — query budget", () => {
  it("reads the products row once for a simple product", async () => {
    const productId = await seedProduct();

    await placeOrder({ productId, productName: "Budget Fixture", quantity: 2 });

    const reads = selectsAgainst("products");
    expect(
      reads.length,
      `products SELECTs:\n${reads.join("\n")}`,
    ).toBeLessThanOrEqual(1);
  });

  it("reads the variant row at most twice for a variant product", async () => {
    const productId = await seedProduct({ hasVariants: true, sku: null });
    const variantId = await seedVariant(productId);

    await placeOrder({
      productId,
      productName: "Budget Fixture",
      variantId,
      variantLabel: "M",
      quantity: 2,
    });

    const reads = selectsAgainst("product_variants");
    expect(
      reads.length,
      `product_variants SELECTs:\n${reads.join("\n")}`,
    ).toBeLessThanOrEqual(2);
  });

  it("does not re-read the reward product once per field when an offer fires", async () => {
    const productId = await seedProduct();
    await db.insert(schema.offers).values({
      id: uid("offer"),
      name: "Buy 2 get 1 free",
      triggerProductId: productId,
      triggerQuantity: 2,
      rewardProductId: productId,
      rewardQuantity: 1,
      discountType: "free",
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });

    await placeOrder({ productId, productName: "Budget Fixture", quantity: 2 });

    // Same product is both trigger and reward: name, inventory and sku must
    // come from one read, not three.
    const reads = selectsAgainst("products");
    expect(
      reads.length,
      `products SELECTs:\n${reads.join("\n")}`,
    ).toBeLessThanOrEqual(1);
  });
});

// ─── End-to-end read budget across the whole checkout path ────────────────────
//
// The handler calls validateOrderSkus, then checkStoreOrderStock, then
// createStoreOrder. Each batches internally, but they do not share what they
// loaded — so the same catalog rows are fetched more than once per checkout.
// This measures the real total the way the handler actually spends it.

import {
  loadCatalogSnapshot,
  findMissingSku,
  findStockShortfall,
} from "../../../../cod-shared/queries/catalog-snapshot";
import { normalizeOrderLines } from "../../../../cod-shared/queries/cart";


describe("checkout path — total catalog reads per order", () => {
  async function runHandlerSequence(items: Array<{ productId: string; productName: string; variantId?: string; quantity: number }>) {
    const customer = await findOrCreateCustomer(db, {
      phone: `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      name: "Budget Buyer",
      wilayaId: WILAYA,
    });
    sqlLog = []; // measure the checkout only, not the customer upsert

    // Exactly what the handler does: normalise, load ONCE, then ask each
    // question of that one snapshot and hand it to the engine.
    const lines = normalizeOrderLines({
      productId: items[0].productId,
      productName: items[0].productName,
      quantity: 1,
      items,
    } as any);
    const snapshot = await loadCatalogSnapshot(db, lines, new Date().toISOString());
    findMissingSku(snapshot, lines);
    findStockShortfall(snapshot, lines);
    await createStoreOrder(db, {
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      wilayaId: WILAYA,
      communeId: null,
      deliveryType: "home",
      deliveryFee: 600,
      productId: items[0].productId,
      productName: items[0].productName,
      quantity: 1,
      pricePerUnit: 1,
      items,
    } as any, snapshot);
  }

  it("reads the products table ONCE for a one-product checkout", async () => {
    const p = await seedProduct();
    await runHandlerSequence([{ productId: p, productName: "P", quantity: 2 }]);

    const reads = selectsAgainst("products");
    expect(reads.length, `products SELECTs:\n${reads.join("\n")}`).toBeLessThanOrEqual(1);
  });

  it("reads the products table ONCE for a three-product basket", async () => {
    const a = await seedProduct();
    const b = await seedProduct();
    const c = await seedProduct();
    await runHandlerSequence([
      { productId: a, productName: "A", quantity: 1 },
      { productId: b, productName: "B", quantity: 1 },
      { productId: c, productName: "C", quantity: 1 },
    ]);

    // Batched: basket size must not change the number of round trips.
    const reads = selectsAgainst("products");
    expect(reads.length, `products SELECTs:\n${reads.join("\n")}`).toBeLessThanOrEqual(1);
  });
});
