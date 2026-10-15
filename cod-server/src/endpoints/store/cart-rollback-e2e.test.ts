/**
 * Cart rollback rehearsal — PostgreSQL E2E.
 *
 * The whole feature is a per-store boolean defaulting to off, so the documented
 * rollback is one statement:
 *
 *     UPDATE stores SET cart_enabled = 0;
 *
 * This suite rehearses it against a real database rather than asserting it in
 * prose, because the claim that matters is not "the switch flips" — it is that
 * flipping it back **cannot damage orders already taken**. A merchant who turns
 * the cart off after a bad morning must not discover that yesterday's
 * three-product orders have become unreadable, unpickable, or wrongly priced.
 *
 * A multi-line order is an ordinary Orestore order. Nothing about it depends on
 * the switch that allowed a shopper to build it.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import {
  createStoreOrder,
  findOrCreateCustomer,
  getStoreConfig,
} from "../../../../cod-shared/queries/store";
import { first } from "../../../../cod-shared/db/client";

let harness: TestDb;

const registry: TestDb[] = [];
let db: AppDb;
let storeId: string;

const WILAYA = 16;
const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  harness = await createTestDb();
  registry.push(harness);
  db = harness.db;
});

beforeEach(async () => {
  await db.delete(schema.orderProducts);
  await db.delete(schema.stockMovements);
  await db.delete(schema.orderStatusHistory);
  await db.delete(schema.orders);
  await db.delete(schema.products);

  storeId = await harness.setStore({
    id: storeId,
    name: "Pilot Store",
    cartEnabled: true,
    createdAt: now(),
    updatedAt: now(),
  });
});

afterAll(async () => {
  for (const mf of registry) await mf.dispose();
});

async function seedProduct(opts: { price: number; name: string; inventory?: number }) {
  const id = uid("prod");
  await db.insert(schema.products).values({
    id,
    name: opts.name,
    handle: `handle-${id}`,
    price: opts.price,
    sku: `SKU-${id}`,
    hasVariants: false,
    inventory: opts.inventory ?? 100,
    trackInventory: true,
    lowStockThreshold: 2,
    status: "ACTIVE",
    visibility: true,
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

/** The rollback, exactly as documented. */
async function rollback() {
  await db.update(schema.stores).set({ cartEnabled: false }).where(eq(schema.stores.id, storeId));
}

async function placeBasketOrder() {
  const customer = await findOrCreateCustomer(db, {
    name: "Ahmed Benali",
    phone: `05${Math.floor(10000000 + Math.random() * 89999999)}`,
    wilayaId: WILAYA,
    communeId: "c-16-001",
  });
  const hoodie = await seedProduct({ price: 2400, name: "Hoodie Classic" });
  const tshirt = await seedProduct({ price: 1000, name: "Street Fighter 45" });

  const order = await createStoreOrder(db, {
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    wilayaId: WILAYA,
    communeId: "c-16-001",
    deliveryType: "home",
    deliveryFee: 600,
    quantity: 1,
    items: [
      { productId: hoodie, productName: "Hoodie Classic", quantity: 2 },
      { productId: tshirt, productName: "Street Fighter 45", quantity: 1 },
    ],
  } as never);

  return { order, hoodie, tshirt };
}

const linesOf = (orderId: string) =>
  db.select().from(schema.orderProducts).where(eq(schema.orderProducts.orderId, orderId));

const inventoryOf = async (productId: string) =>
  (await db.select().from(schema.products).where(eq(schema.products.id, productId)).then(first))!
    .inventory;

// ─────────────────────────────────────────────────────────────────────────────

describe("the switch itself", () => {
  it("is what the storefront reads", async () => {
    expect((await getStoreConfig(db, storeId))?.cartEnabled).toBe(true);

    await rollback();

    expect((await getStoreConfig(db, storeId))?.cartEnabled).toBe(false);
  });

  it("can be turned back on without any other step", async () => {
    // Rollback is not one-way: a merchant who switches off to investigate must
    // be able to switch back on, with no migration or data fix in between.
    await rollback();

    await db
      .update(schema.stores)
      .set({ cartEnabled: true })
      .where(eq(schema.stores.id, storeId));

    expect((await getStoreConfig(db, storeId))?.cartEnabled).toBe(true);
  });

  it("leaves every other store setting alone", async () => {
    const before = await getStoreConfig(db, storeId);

    await rollback();
    const after = await getStoreConfig(db, storeId);

    expect({ ...after, cartEnabled: true }).toEqual({ ...before, cartEnabled: true });
  });
});

describe("orders already taken survive the rollback", () => {
  it("keeps every line of a multi-product order", async () => {
    const { order } = await placeBasketOrder();
    expect(await linesOf(order.id)).toHaveLength(2);

    await rollback();

    const lines = await linesOf(order.id);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.productName).sort()).toEqual([
      "Hoodie Classic",
      "Street Fighter 45",
    ]);
  });

  it("keeps the order's money exactly as charged", async () => {
    const { order } = await placeBasketOrder();
    const before = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, order.id))
      .then(first);

    await rollback();

    const after = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, order.id))
      .then(first);
    expect(after).toEqual(before);
    // Goods only, priced from the catalog: 2 × 2400 + 1 × 1000.
    expect(after!.price).toBe(5800);
  });

  it("does not give stock back", async () => {
    // Turning a feature off is not a cancellation. The parcels are still going
    // out, and silently restocking them would oversell the shop.
    const { order, hoodie, tshirt } = await placeBasketOrder();
    expect(await inventoryOf(hoodie)).toBe(98);
    expect(await inventoryOf(tshirt)).toBe(99);

    await rollback();

    expect(await inventoryOf(hoodie)).toBe(98);
    expect(await inventoryOf(tshirt)).toBe(99);
    expect(await linesOf(order.id)).toHaveLength(2);
  });

  it("leaves the order readable the way the dashboard reads it", async () => {
    const { order } = await placeBasketOrder();

    await rollback();

    const row = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id)).then(first);
    expect(row).toBeDefined();
    expect(row!.status).toBe("new");
    // Products live in order_products, which the dashboard joins — the lines
    // are what a picker and a carrier label are built from.
    const lines = await linesOf(order.id);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.productName && l.quantity > 0)).toBe(true);
  });
});

describe("after the rollback", () => {
  it("a single-product order still goes through", async () => {
    // The express path never depended on the cart, and must not start to.
    await rollback();
    const customer = await findOrCreateCustomer(db, {
      name: "Sara",
      phone: "0661234567",
      wilayaId: WILAYA,
      communeId: "c-16-001",
    });
    const product = await seedProduct({ price: 1500, name: "Cap" });

    const order = await createStoreOrder(db, {
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      wilayaId: WILAYA,
      communeId: "c-16-001",
      deliveryType: "home",
      deliveryFee: 400,
      productId: product,
      productName: "Cap",
      quantity: 2,
      pricePerUnit: 1500,
    } as never);

    expect(await linesOf(order.id)).toHaveLength(1);
    expect(order.price).toBe(3000);
  });
});
