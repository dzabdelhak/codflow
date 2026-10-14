/**
 * One delivery grid per account, delivery modes per channel (ticket 06), on
 * PostgreSQL: two stores of a merchant price from the same grid, each offers
 * only the modes it enables and the grid configures, and an order records the
 * grid version it was priced with.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import {
  createStoreOrder,
  findOrCreateCustomer,
  getShippingRates,
  getStoreConfig,
} from "../../../../cod-shared/queries/store";
import { saveCheckoutFormPolicy, getCheckoutFormPolicy } from "../../../../cod-shared/queries/checkout-form";
import { currentGridVersion, resolveDeliveryFee } from "../../../../cod-shared/queries/shipping-resolution";

let harness: TestDb;
let storeA: AppDb;
let storeB: AppDb;
const NOW = () => new Date().toISOString();

beforeAll(async () => {
  harness = await createTestDb();
  storeA = harness.db;
  await harness.createStore("grid-b");
  storeB = await harness.connect("grid-b");

  await storeA.insert(schema.shippingProfiles).values([
    { id: "grid-default", name: "Standard", isDefault: true, createdAt: NOW(), updatedAt: NOW() },
    { id: "grid-express", name: "Express", isDefault: false, createdAt: NOW(), updatedAt: NOW() },
  ]);
  await storeA.insert(schema.shippingRules).values([
    { id: "r-16", profileId: "grid-default", wilayaId: 16, homePrice: 400, stopDeskPrice: 250, homeEnabled: true, stopDeskEnabled: true, createdAt: NOW() },
    { id: "r-1", profileId: "grid-default", wilayaId: 1, homePrice: 900, stopDeskPrice: 0, homeEnabled: true, stopDeskEnabled: false, createdAt: NOW() },
    { id: "rx-16", profileId: "grid-express", wilayaId: 16, homePrice: 700, stopDeskPrice: 0, homeEnabled: true, stopDeskEnabled: false, createdAt: NOW() },
  ]);
  await storeA.insert(schema.products).values({
    id: "grid-p", name: "P", handle: "grid-p", price: 1000, sku: "GRID-P", inventory: 50, createdAt: NOW(), updatedAt: NOW(),
  });
}, 120_000);

afterAll(async () => {
  await harness?.dispose();
});

async function order(db: AppDb, deliveryFee: number | null) {
  const customer = await findOrCreateCustomer(db, { phone: `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, name: "C", wilayaId: 16 });
  return createStoreOrder(db, {
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    wilayaId: 16,
    communeId: null,
    deliveryType: "home",
    deliveryFee,
    productId: "grid-p",
    productName: "P",
    quantity: 1,
    pricePerUnit: 1000,
  } as never);
}

describe("one grid, modes per channel", () => {
  it("lets channel A offer home and stop-desk while channel B offers home only, from the same grid", async () => {
    const { policy } = await getCheckoutFormPolicy(storeB, "grid-b");
    await saveCheckoutFormPolicy(storeB, "grid-b", { ...policy, deliveryOptions: { home: true, stopDesk: false } });

    expect((await getStoreConfig(storeA, TEST_STORE_ID))!.checkoutForm.deliveryOptions).toEqual({ home: true, stopDesk: true });
    expect((await getStoreConfig(storeB, "grid-b"))!.checkoutForm.deliveryOptions).toEqual({ home: true, stopDesk: false });
    expect(await getShippingRates(storeB)).toEqual(await getShippingRates(storeA));
  });

  it("never alters the account grid when a channel changes its modes", async () => {
    const before = await currentGridVersion(storeA);
    const { policy } = await getCheckoutFormPolicy(storeA, TEST_STORE_ID);
    await saveCheckoutFormPolicy(storeA, TEST_STORE_ID, { ...policy, deliveryOptions: { home: true, stopDesk: true } });
    expect(await currentGridVersion(storeA)).toBe(before);
  });

  it("does not show a mode the grid prices nowhere, nor one the chosen wilaya does not offer", async () => {
    const rates = await getShippingRates(storeA);
    expect(rates[1]).toEqual({ home: 900, stopDesk: null });

    await storeA.update(schema.shippingRules).set({ stopDeskEnabled: false }).where(eq(schema.shippingRules.id, "r-16"));
    expect((await getStoreConfig(storeA, TEST_STORE_ID))!.checkoutForm.deliveryOptions).toEqual({ home: true, stopDesk: false });
    await storeA.update(schema.shippingRules).set({ stopDeskEnabled: true }).where(eq(schema.shippingRules.id, "r-16"));
  });

  it("prices a channel from its own default profile when it has one, the account default otherwise", async () => {
    const params = { productIds: [], wilayaId: 16, communeId: null, deliveryType: "home" as const };
    expect(await resolveDeliveryFee(storeB, params)).toBe(400);

    await storeB.update(schema.stores).set({ defaultShippingProfileId: "grid-express" }).where(eq(schema.stores.id, "grid-b"));
    expect(await resolveDeliveryFee(storeB, params)).toBe(700);
    expect(await resolveDeliveryFee(storeA, params)).toBe(400);
  });
});

describe("orders record the grid they were priced with", () => {
  it("stores the fee and the grid version, and a new version after the grid changes", async () => {
    const version = await currentGridVersion(storeA);
    const first = await order(storeA, 400);
    const row = await storeA.select().from(schema.orders).where(eq(schema.orders.id, first.id)).then((r) => r[0]);
    expect(row).toMatchObject({ deliveryFee: 400, deliveryGridVersion: version, deliveryFeeToConfirm: false });

    await storeA.update(schema.shippingRules).set({ homePrice: 450 }).where(eq(schema.shippingRules.id, "r-16"));
    const second = await order(storeA, 450);
    const next = await storeA.select().from(schema.orders).where(eq(schema.orders.id, second.id)).then((r) => r[0]);
    expect(next?.deliveryGridVersion).toBe(version! + 1);

    const queued = await storeA.select().from(schema.outboundOrders).where(eq(schema.outboundOrders.orderId, second.id)).then((r) => r[0]);
    expect(queued?.payload).toMatchObject({ delivery: { fee: 450, gridVersion: version! + 1, feeToConfirm: false } });
  });

  it("marks the fee to confirm with no grid version when no fee is known", async () => {
    const placed = await order(storeA, null);
    const row = await storeA.select().from(schema.orders).where(eq(schema.orders.id, placed.id)).then((r) => r[0]);
    expect(row).toMatchObject({ deliveryFeeToConfirm: true, deliveryGridVersion: null });
  });
});
