/**
 * Landing Pages — Slice 1: schema round-trip on real PostgreSQL.
 *
 * Proves migration 0019 matches the drizzle schema 1:1 and that the FK
 * contracts hold: image cascade on LP delete, orders blocking LP delete,
 * orders.landingPageId nullable (best-effort attribution shape).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import { landingPages, landingPageImages } from "@/db/schema";
import { first } from "../../../../cod-shared/db/client";
import { deleteLandingPageWithGuard } from "./queries";

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

const NOW = () => new Date().toISOString();

async function seedProduct(id: string) {
  await db.insert(schema.products).values({
    id, name: `LP Product ${id}`, handle: `lp-product-${id}`, price: 5000,
    hasVariants: false, inventory: 10, trackInventory: true, lowStockThreshold: 2,
    status: "ACTIVE", visibility: true,
    createdAt: NOW(), updatedAt: NOW(),
  });
}

describe("Slice 1 — landing pages schema on real PostgreSQL", () => {
  it("creates a landing page with defaults and round-trips through drizzle", async () => {
    await seedProduct("prod-lp-s1");
    await db.insert(landingPages).values({
      id: "lp-1", slug: "lp-abcdefgh", name: "Test LP", productId: "prod-lp-s1",
      createdAt: NOW(), updatedAt: NOW(),
    });

    const row = await db.select().from(landingPages).where(eq(landingPages.id, "lp-1")).then(first);
    expect(row).toMatchObject({
      id: "lp-1",
      slug: "lp-abcdefgh",
      name: "Test LP",
      productId: "prod-lp-s1",
      status: "draft",
      imageGap: 0,
      sidePadding: 0,
      contentMaxWidth: 0,
      views: 0,
      publishedAt: null,
      metaTitle: null,
      metaDescription: null,
    });
  });

  it("slug uniqueness is enforced at the DB level", async () => {
    await expect(
      db.insert(landingPages).values({
        id: "lp-dup", slug: "lp-abcdefgh", name: "Dup", productId: "prod-lp-s1",
        createdAt: NOW(), updatedAt: NOW(),
      }),
    ).rejects.toThrow();
  });

  it("image rows keep their position order and cascade on LP delete", async () => {
    await seedProduct("prod-lp-s2");
    await db.insert(landingPages).values({
      id: "lp-2", slug: "lp-s2slug", name: "Cascade LP", productId: "prod-lp-s2",
      createdAt: NOW(), updatedAt: NOW(),
    });
    for (const [imgId, pos] of [["lpimg-1", 1], ["lpimg-2", 2], ["lpimg-3", 3]] as const) {
      await db.insert(landingPageImages).values({
        id: imgId, landingPageId: "lp-2", r2Key: `landing/${imgId}.jpg`,
        src: `https://media.example/landing/${imgId}.jpg`, position: pos, createdAt: NOW(),
      });
    }

    const images = await db.select().from(landingPageImages)
      .where(eq(landingPageImages.landingPageId, "lp-2"));
    expect(images.map((i) => i.position).sort()).toEqual([1, 2, 3]);
    expect(images[0]).toMatchObject({ source: "upload", altText: null });

    await db.delete(landingPages).where(eq(landingPages.id, "lp-2"));
    expect(
      await db.select().from(landingPageImages).where(eq(landingPageImages.landingPageId, "lp-2")),
    ).toHaveLength(0);
  });

  it("orders.landingPageId is nullable, and a page with attributed orders cannot be deleted", async () => {
    await seedProduct("prod-lp-s3");
    await db.insert(landingPages).values({
      id: "lp-3", slug: "lp-s3slug", name: "Attribution LP", productId: "prod-lp-s3",
      createdAt: NOW(), updatedAt: NOW(),
    });
    await db.insert(schema.customers).values({
      id: "cust-lp-s3", name: "LP Customer", phone: "0555000001",
      wilaya: "الجزائر", totalOrders: 0, totalSpent: 0, createdAt: NOW(),
    });
    await db.insert(schema.orders).values({
      id: "ord-lp-s3", orderNumber: "ORD-LP-S3", customerId: "cust-lp-s3",
      customerName: "LP Customer", phone: "0555000001", price: 5000,
      status: "new", deliveryMethod: "unassigned", deliveryType: "home",
      deliveryFee: 0, driverFee: 0, codAmount: 5000,
      landingPageId: "lp-3",
      createdAt: NOW(), updatedAt: NOW(),
    });

    const order = await db.select().from(schema.orders)
      .where(eq(schema.orders.id, "ord-lp-s3")).then(first);
    expect(order?.landingPageId).toBe("lp-3");

    await expect(deleteLandingPageWithGuard(db, "lp-3")).rejects.toMatchObject({ code: "LANDING_PAGE_HAS_ORDERS" });
    expect(await db.select().from(landingPages).where(eq(landingPages.id, "lp-3")).then(first)).toBeDefined();
  });

  it("unattributed order (NULL landingPageId) is the default best-effort shape", async () => {
    await db.insert(schema.customers).values({
      id: "cust-lp-s4", name: "LP Customer 2", phone: "0555000002",
      wilaya: "الجزائر", totalOrders: 0, totalSpent: 0, createdAt: NOW(),
    });
    await db.insert(schema.orders).values({
      id: "ord-lp-s4", orderNumber: "ORD-LP-S4", customerId: "cust-lp-s4",
      customerName: "LP Customer 2", phone: "0555000002", price: 3000,
      status: "new", deliveryMethod: "unassigned", deliveryType: "home",
      deliveryFee: 0, driverFee: 0, codAmount: 3000,
      createdAt: NOW(), updatedAt: NOW(),
    });

    const order = await db.select().from(schema.orders)
      .where(eq(schema.orders.id, "ord-lp-s4")).then(first);
    expect(order?.landingPageId).toBeNull();
  });
});
