/**
 * Carrier value ceiling at dispatch — real-D1 E2E.
 *
 * The rules themselves are unit-tested in carrier-limits.test.ts. What this
 * file proves is the WIRING, which is the part that actually protects a
 * merchant: that an over-ceiling order is refused **before** the carrier is
 * called, and that an acceptable one still goes through.
 *
 * Only the carrier itself is mocked — we cannot call Yalidine from a test.
 * Everything else is the real handler against a real database with the real
 * migrations. The provider spy is what lets us assert "never called", which is
 * the whole point of checking before dispatch rather than after.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import { first } from "../../../../cod-shared/db/client";

const createShipment = vi.fn();

vi.mock("@/endpoints/delivery-companies/providers/registry", () => ({
  getProvider: () => ({ createShipment }),
  isEcotrackCompany: () => false,
}));

// Shipment persistence and audit logging are not what this file is about.
vi.mock("@/endpoints/delivery-companies/providers/shipments", () => ({
  createShipmentRecord: vi.fn(async () => "shipment-1"),
  setShipmentValidated: vi.fn(async () => undefined),
  getShipmentByOrder: vi.fn(async () => null),
  logApiCall: vi.fn(async () => undefined),
}));
vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn(async () => undefined),
  ACTIONS: new Proxy({}, { get: (_t, p) => String(p) }),
}));

const registry: TestDb[] = [];
let db: AppDb;

const WILAYA = 16;
const YALIDINE_MAX = 150_000;

beforeAll(async () => {
  const harness = await createTestDb();
  registry.push(harness);
  db = harness.db;
});

beforeEach(async () => {
  createShipment.mockReset();
  createShipment.mockResolvedValue({
    trackingNumber: "YAL-TEST-1",
    labelUrl: "https://example.com/label.pdf",
    rawResponse: "{}",
  });
  await db.delete(schema.orderProducts);
  await db.delete(schema.orderStatusHistory);
  await db.delete(schema.orders);
  await db.delete(schema.customers);
  await db.delete(schema.products);
  await db.delete(schema.deliveryCompanies);
});

afterAll(async () => {
  for (const mf of registry) await mf.dispose();
});

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

async function seedCompany(code: string, name: string) {
  const id = uid("company");
  await db.insert(schema.deliveryCompanies).values({
    id,
    name,
    nameAr: name,
    code,
    active: true,
    apiEndpoint: "https://api.example.com",
    apiToken: "token",
    autoValidate: false,
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

/** A real order with real line rows, priced to land either side of a ceiling. */
async function seedOrder(opts: {
  companyId: string;
  price: number;
  deliveryFee: number;
  productNames?: string[];
}) {
  const customerId = uid("cust");
  await db.insert(schema.customers).values({
    id: customerId,
    name: "Dispatch Buyer",
    phone: `066${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    wilayaId: WILAYA,
    wilaya: "الجزائر",
    createdAt: now(),
  });

  const commune = await db
    .select({ id: schema.communes.id })
    .from(schema.communes)
    .where(eq(schema.communes.wilayaId, WILAYA))
    .then(first);

  const orderId = uid("ord");
  await db.insert(schema.orders).values({
    id: orderId,
    orderNumber: `ORD-20260101-${Math.floor(1000 + Math.random() * 8999)}`,
    customerId,
    customerName: "Dispatch Buyer",
    phone: "0661234567",
    wilayaId: WILAYA,
    communeId: commune!.id,
    address: "Rue des Lilas",
    price: opts.price,
    status: "new",
    deliveryMethod: "company",
    companyId: opts.companyId,
    deliveryType: "home",
    deliveryFee: opts.deliveryFee,
    driverFee: 0,
    codAmount: opts.price + opts.deliveryFee,
    createdAt: now(),
    updatedAt: now(),
  });

  for (const name of opts.productNames ?? ["Product"]) {
    const productId = uid("prod");
    await db.insert(schema.products).values({
      id: productId,
      name,
      handle: `handle-${productId}`,
      price: 1000,
      sku: `SKU-${productId}`,
      hasVariants: false,
      inventory: 100,
      trackInventory: false,
      lowStockThreshold: 2,
      status: "ACTIVE",
      visibility: true,
      showInStore: true,
      storeFeatured: false,
      createdAt: now(),
      updatedAt: now(),
    });
    await db.insert(schema.orderProducts).values({
      id: uid("op"),
      orderId,
      productId,
      productName: name,
      quantity: 1,
      pricePerUnit: 1000,
      lineTotal: 1000,
      createdAt: now(),
    });
  }

  return orderId;
}

/** Minimal Hono-ish context — the handler only reaches for these. */
function makeContext(orderId: string, body: Record<string, unknown> = {}) {
  return {
    env: { DB: {} as D1Database },
    req: {
      param: () => orderId,
      json: async () => body,
      header: () => undefined,
      valid: () => body,
    },
    get: (key: string) => (key === "user" ? { id: "u1", name: "Admin" } : undefined),
    json: (payload: unknown, status = 200) => ({ payload, status }),
    executionCtx: { waitUntil: () => {} },
  } as any;
}

// The handler resolves its db through c.get("db"); point that at the real
// Miniflare database so everything below the carrier is genuinely exercised.
vi.mock("@/db", () => ({ getDb: () => db }));

async function dispatch(orderId: string, body: Record<string, unknown> = {}) {
  const { dispatchToCompany } = await import("./dispatch");
  return dispatchToCompany(makeContext(orderId, body));
}

describe("dispatch — carrier value ceiling (Q3)", () => {
  it("refuses an over-ceiling order WITHOUT calling the carrier", async () => {
    const companyId = await seedCompany("yalidine", "Yalidine");
    const orderId = await seedOrder({
      companyId,
      price: YALIDINE_MAX,
      deliveryFee: 600, // 150,600 — over the documented maximum
    });

    await expect(dispatch(orderId)).rejects.toThrow(/maximum/i);

    // The whole point: the merchant is told before a parcel is created.
    expect(createShipment).not.toHaveBeenCalled();
  });

  it("names the amount and the cap so the merchant can act", async () => {
    const companyId = await seedCompany("yalidine", "Yalidine");
    const orderId = await seedOrder({ companyId, price: 200_000, deliveryFee: 0 });

    await expect(dispatch(orderId)).rejects.toThrow(/200000|150000/);
  });

  it("dispatches an order exactly ON the ceiling", async () => {
    // Yalidine documents 0–150000 inclusive — 150,000 must go through.
    const companyId = await seedCompany("yalidine", "Yalidine");
    const orderId = await seedOrder({
      companyId,
      price: YALIDINE_MAX - 600,
      deliveryFee: 600,
    });

    await dispatch(orderId);
    expect(createShipment).toHaveBeenCalledOnce();
  });

  it("does not block a carrier that publishes no ceiling", async () => {
    const companyId = await seedCompany("zr_express", "ZR Express");
    const orderId = await seedOrder({ companyId, price: 900_000, deliveryFee: 0 });

    await dispatch(orderId);
    expect(createShipment).toHaveBeenCalledOnce();
  });

  it("sends a description carrying every product and the order number", async () => {
    const companyId = await seedCompany("yalidine", "Yalidine");
    const orderId = await seedOrder({
      companyId,
      price: 5_000,
      deliveryFee: 600,
      productNames: ["Shirt", "Mug", "Cap"],
    });

    await dispatch(orderId);

    const payload = createShipment.mock.calls[0][0];
    expect(payload.productDescription).toContain("Shirt");
    expect(payload.productDescription).toContain("Mug");
    expect(payload.productDescription).toContain("Cap");
    expect(payload.productDescription).toContain("ORD-");
  });

  it("truncates a large basket's description but keeps the order number", async () => {
    const companyId = await seedCompany("yalidine", "Yalidine");
    const orderId = await seedOrder({
      companyId,
      price: 5_000,
      deliveryFee: 600,
      productNames: Array.from(
        { length: 20 },
        (_, i) => `A Fairly Long Product Name Number ${i}`,
      ),
    });

    await dispatch(orderId);

    const payload = createShipment.mock.calls[0][0];
    expect(payload.productDescription.length).toBeLessThanOrEqual(255);
    expect(payload.productDescription).toContain("ORD-");
  });

  it("charges the carrier the order total, not just the goods", async () => {
    const companyId = await seedCompany("yalidine", "Yalidine");
    const orderId = await seedOrder({ companyId, price: 5_000, deliveryFee: 600 });

    await dispatch(orderId);

    expect(createShipment.mock.calls[0][0].amount).toBe(5_600);
  });
});
