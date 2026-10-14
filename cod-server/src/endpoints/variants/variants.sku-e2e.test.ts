/**
 * Variant SKU uniqueness — real PostgreSQL (regression for the raw-500 crash)
 *
 * The dashboard product editor sends variant creates/updates in a save
 * sequence. A SKU that collides with an existing variant previously crashed
 * at the DB level (UNIQUE constraint failed → HTTP 500 → generic toast).
 * The wrapped queries in ./queries now turn that into a friendly
 * BusinessLogicError(DUPLICATE_SKU) carrying the SKU.
 *
 * This is the exact production failure from requestId
 * aa6d6370-2ceb-4714-913e-11610dd5adbe (POST /api/products/:id/variants).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import { createVariant, updateVariant } from "./queries";
import { ConflictError } from "@/lib/errors/classes";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { first } from "../../../../cod-shared/db/client";

let db: AppDb;

beforeAll(async () => {
  const harness = await createTestDb();
  db = harness.db;
  registry.push(harness);
}, 120_000);

const registry: TestDb[] = [];
afterAll(async () => {
  for (const mf of registry) await mf.dispose();
});

let seq = 0;
const NOW = () => new Date().toISOString();

async function seedProduct() {
  const id = `prod-sku-${++seq}`;
  await db.insert(schema.products).values({
    id, name: `SKU Product ${seq}`, handle: `sku-product-${seq}`, price: 1000,
    hasVariants: true, inventory: 0, trackInventory: true, lowStockThreshold: 2,
    status: "ACTIVE", visibility: true,
    createdAt: NOW(), updatedAt: NOW(),
  });
  return id;
}

async function seedVariant(productId: string, sku: string) {
  const id = `var-sku-${++seq}`;
  await db.insert(schema.productVariants).values({
    id, productId, variations: JSON.stringify({ اللون: "أسود" }), currency: "DZD",
    price: 1200, sku, inventory: 5, isDefault: true, active: true,
    position: 1, createdAt: NOW(), updatedAt: NOW(),
  });
  return id;
}

function variantData(sku: string) {
  return {
    variations: { اللون: "أحمر" },
    price: 1300,
    sku,
    inventory: 3,
    isDefault: false,
    active: true,
    position: 2,
  };
}

describe("variant SKU uniqueness — friendly 409 instead of raw 500", () => {
  it("createVariant with a taken SKU throws BusinessLogicError(DUPLICATE_SKU) with the SKU", async () => {
    const productId = await seedProduct();
    await seedVariant(productId, "SKU-TAKEN-1");

    let caught: unknown;
    try {
      await createVariant(db, productId, variantData("SKU-TAKEN-1"));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConflictError);
    const err = caught as ConflictError;
    expect(err.code).toBe(ERROR_CODES.DUPLICATE_SKU);
    expect(err.statusCode).toBe(409);
    expect(err.context).toMatchObject({ sku: "SKU-TAKEN-1" });
    // Nothing was written — the batch never ran
    const rows = await db.select().from(schema.productVariants)
      .where((await import("drizzle-orm")).eq(schema.productVariants.productId, productId));
    expect(rows).toHaveLength(1);
  });

  it("updateVariant renaming to a taken SKU throws the same friendly error", async () => {
    const productId = await seedProduct();
    const v1 = await seedVariant(productId, "SKU-A");
    const v2 = await seedVariant(productId, "SKU-B");

    let caught: unknown;
    try {
      await updateVariant(db, v2, { sku: "SKU-A" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConflictError);
    expect((caught as ConflictError).code).toBe(ERROR_CODES.DUPLICATE_SKU);
    expect((caught as ConflictError).context).toMatchObject({ sku: "SKU-A" });
    // v2 kept its original SKU
    const row = await db.select().from(schema.productVariants)
      .where((await import("drizzle-orm")).eq(schema.productVariants.id, v2)).then(first);
    expect(row?.sku).toBe("SKU-B");
  });

  it("updateVariant keeping its own SKU is allowed (no self-collision)", async () => {
    const productId = await seedProduct();
    const v1 = await seedVariant(productId, "SKU-KEEP");

    const result = await updateVariant(db, v1, { sku: "SKU-KEEP", price: 1500 });
    expect(result?.price).toBe(1500);
  });

  it("createVariant with a fresh SKU still succeeds (opening stock ledger intact)", async () => {
    const productId = await seedProduct();

    const result = await createVariant(db, productId, variantData("SKU-FRESH-1"));
    expect(result?.sku).toBe("SKU-FRESH-1");
    const movements = await db.select().from(schema.stockMovements)
      .where((await import("drizzle-orm")).eq(schema.stockMovements.productId, productId));
    expect(movements).toHaveLength(1); // opening stock logged
  });
});
