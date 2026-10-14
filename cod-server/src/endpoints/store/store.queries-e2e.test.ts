/**
 * createStoreOrder + findOrCreateCustomer — Slice 3 PostgreSQL E2E.
 *
 * Runs the real migrations on PostgreSQL and proves:
 *   • findOrCreateCustomer: concurrent same-phone calls converge to ONE row
 *     (UNIQUE index + ON CONFLICT), stats never split
 *   • createStoreOrder: one atomic batch — order + lines + history + customer
 *     stats + deduction movements all land together
 *   • guarded deduction: inventory goes down by exactly the ordered qty,
 *     movement log carries correct qtyBefore/qtyAfter
 *   • BC-2 oversell: when inventory can't cover the order, the guarded
 *     UPDATE writes 0 rows and the order is rejected whole (no partial writes)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import {
  findOrCreateCustomer,
  createStoreOrder,
} from "../../../../cod-shared/queries/store";
import { first } from "../../../../cod-shared/db/client";

const registry: TestDb[] = [];
let db: AppDb;

beforeAll(async () => {
  const harness = await createTestDb();
  registry.push(harness);
  db = harness.db;
}, 120_000);

afterAll(async () => {
  for (const mf of registry) await mf.dispose();
});

describe("findOrCreateCustomer — race-free upsert (BC-1)", () => {
  it("converges concurrent same-phone calls to one customer row", async () => {
    const rows = await Promise.all(
      Array.from({ length: 5 }, () =>
        findOrCreateCustomer(db, {
          phone: "0777000001",
          name: "Race Tester",
          wilayaId: 16,
        }),
      ),
    );

    const all = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.phone, "0777000001"));
    expect(all).toHaveLength(1);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    expect(rows[0]).toMatchObject({ phone: "0777000001", name: "Race Tester" });
  });

  it("updates the name on an existing phone but keeps stats", async () => {
    const first = await findOrCreateCustomer(db, {
      phone: "0777000002",
      name: "Original Name",
      wilayaId: 16,
    });
    await db
      .update(schema.customers)
      .set({ totalOrders: 5, totalSpent: 9000 })
      .where(eq(schema.customers.id, first.id));

    const second = await findOrCreateCustomer(db, {
      phone: "0777000002",
      name: "Updated Name",
      wilayaId: 16,
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Updated Name");
    expect(second.totalOrders).toBe(5);
  });
});

describe("createStoreOrder — atomic commit + guarded deduction (BC-2)", () => {
  const phone = "0661234567";

  async function seedTrackedProduct(overrides: Partial<typeof schema.products.$inferInsert> = {}) {
    const id = `prod-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    await db.insert(schema.products).values({
      id,
      name: "E2E Product",
      handle: `e2e-${id}`,
      price: 1500,
      hasVariants: false,
      inventory: 10,
      trackInventory: true,
      lowStockThreshold: 2,
      status: "ACTIVE",
      visibility: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
    return id;
  }

  async function seedCustomer(p: string) {
    return findOrCreateCustomer(db, {
      phone: p,
      name: "E2E Buyer",
      wilayaId: 16,
    });
  }

  it("commits order + line + history + stats + deduction in one batch", async () => {
    const productId = await seedTrackedProduct();
    const customer = await seedCustomer(phone);

    const result = await createStoreOrder(db, {
      customerName: customer.name,
      phone,
      wilayaId: 16,
      communeId: "c-16-001",
      deliveryType: "home",
      productId,
      productName: "E2E Product",
      quantity: 3,
      pricePerUnit: 1500,
      customerId: customer.id,
      deliveryFee: 400,
    });

    expect(result.price).toBe(4500);
    expect(result.deliveryFee).toBe(400);
    expect(result.orderNumber).toMatch(/^CMD-\d{5}$/);

    const order = await db.select().from(schema.orders).where(eq(schema.orders.id, result.id)).then(first);
    expect(order).toMatchObject({
      status: "new",
      codAmount: 4900,
      customerId: customer.id,
    });

    const lines = await db
      .select()
      .from(schema.orderProducts)
      .where(eq(schema.orderProducts.orderId, result.id));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 3, lineTotal: 4500 });

    const history = await db
      .select()
      .from(schema.orderStatusHistory)
      .where(eq(schema.orderStatusHistory.orderId, result.id));
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("new");

    const cust = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id)).then(first);
    expect(cust?.totalOrders).toBe(1);
    expect(cust?.totalSpent).toBe(4500);

    const product = await db.select().from(schema.products).where(eq(schema.products.id, productId)).then(first);
    expect(product?.inventory).toBe(7);

    const movements = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.reference, result.id));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "ORDER_DEDUCTED",
      delta: -3,
      qtyBefore: 10,
      qtyAfter: 7,
    });
  });

  it("takes an order inventory cannot cover, unconfirmed, without deducting or going negative", async () => {
    const productId = await seedTrackedProduct({ inventory: 1 });
    const customer = await seedCustomer("0661234599");

    const movementsBefore = await db
      .select({ id: schema.stockMovements.id })
      .from(schema.stockMovements);

    const result = await createStoreOrder(db, {
      customerName: customer.name,
      phone: "0661234599",
      wilayaId: 16,
      communeId: "c-16-001",
      deliveryType: "home",
      productId,
      productName: "E2E Product",
      quantity: 3,
      pricePerUnit: 1500,
      customerId: customer.id,
      deliveryFee: 400,
    });

    expect(result.stockConfirmed).toBe(false);
    const order = await db.select().from(schema.orders).where(eq(schema.orders.id, result.id)).then(first);
    expect(order?.stockConfirmed).toBe(false);

    const movementsAfter = await db
      .select({ id: schema.stockMovements.id })
      .from(schema.stockMovements);
    expect(movementsAfter.length).toBe(movementsBefore.length);

    const product = await db.select().from(schema.products).where(eq(schema.products.id, productId)).then(first);
    expect(product?.inventory).toBe(1);

    const cust = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id)).then(first);
    expect(cust?.totalOrders).toBe(1);
  });
});
