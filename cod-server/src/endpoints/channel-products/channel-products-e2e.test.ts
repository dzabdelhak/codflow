/**
 * One catalogue per account, each channel selecting from it (ticket 05), on
 * PostgreSQL: two stores of the same merchant share products, and what one
 * store does with a product never touches the catalogue or the other store.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, TEST_MERCHANT_ID, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import { createProduct, getAllProducts, updateProduct } from "../../../../cod-shared/queries/products";
import { getStoreProductByHandle, getStoreProducts } from "../../../../cod-shared/queries/store";
import { createPool, withStore } from "@/db/scope";
import { productUsage } from "@/platform/catalogue";
import {
  ensureInChannel,
  isCompleteOrder,
  addToChannel,
  listChannelProducts,
  removeFromChannel,
  reorderChannel,
  setChannelSelection,
} from "../../../../cod-shared/queries/channel-products";
import { findProductNotCarried, loadCatalogSnapshot, priceCartLines } from "../../../../cod-shared/queries/catalog-snapshot";
import { normalizeOrderLines } from "../../../../cod-shared/queries/cart";

let harness: TestDb;
let storeA: AppDb;
let storeB: AppDb;
let stranger: AppDb;

const product = (name: string, price: number) =>
  ({
    name,
    price,
    type: "PHYSICAL",
    hasVariants: false,
    sku: `SKU-${name}`,
    inventory: 10,
    trackInventory: true,
    visibility: true,
    status: "ACTIVE",
  }) as Parameters<typeof createProduct>[1];

beforeAll(async () => {
  harness = await createTestDb();
  storeA = harness.db;
  await harness.createStore("store-b");
  storeB = await harness.connect("store-b");
  const other = await harness.createMerchant("other-merchant");
  await harness.createStore("stranger-store", [], other);
  stranger = await harness.connect("stranger-store");
}, 120_000);

afterAll(async () => {
  await harness?.dispose();
});

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe("one catalogue, two channels", () => {
  it("creates a product once and shows it in both channels once the second adds it", async () => {
    const created = (await createProduct(storeA, product("shared", 2500)))!;

    expect(ids(await getStoreProducts(storeA, {}))).toContain(created.id);
    expect(ids(await getStoreProducts(storeB, {}))).not.toContain(created.id);

    await addToChannel(storeB, [created.id]);

    expect(ids(await getStoreProducts(storeB, {}))).toContain(created.id);
    expect(ids(await getAllProducts(storeB, {}))).toContain(created.id);
  });

  it("hides it in channel A without touching channel B or the catalogue", async () => {
    const created = (await createProduct(storeA, product("hide-me", 3000)))!;
    await addToChannel(storeB, [created.id]);

    await setChannelSelection(storeA, created.id, { published: false });

    expect(ids(await getStoreProducts(storeA, {}))).not.toContain(created.id);
    expect(await getStoreProductByHandle(storeA, created.handle)).toBeNull();
    expect(ids(await getStoreProducts(storeB, {}))).toContain(created.id);
    const inCatalogue = (await getAllProducts(storeA, {})).find((p) => p.id === created.id);
    expect(inCatalogue).toMatchObject({ status: "ACTIVE", visibility: true, inChannel: true, showInStore: false });
  });

  it("removes it from channel A only", async () => {
    const created = (await createProduct(storeA, product("remove-me", 1200)))!;
    await addToChannel(storeB, [created.id]);

    await removeFromChannel(storeA, created.id);

    expect(ids(await getStoreProducts(storeA, {}))).not.toContain(created.id);
    expect(ids(await getStoreProducts(storeB, {}))).toContain(created.id);
    expect((await getAllProducts(storeA, {})).find((p) => p.id === created.id)).toMatchObject({ inChannel: false });
  });

  it("never shows another merchant's catalogue", async () => {
    const created = (await createProduct(storeA, product("private", 900)))!;
    expect(ids(await getAllProducts(stranger, {}))).not.toContain(created.id);
    await expect(addToChannel(stranger, [created.id])).rejects.toThrow();
  });
});

describe("the storefront follows the channel's selection", () => {
  it("lists only published products, in the channel's order, and featured ones on the home page", async () => {
    const [first, second, third] = await Promise.all(
      ["order-1", "order-2", "order-3"].map(async (n, i) => (await createProduct(storeB, product(n, 1000 + i)))!),
    );
    await reorderChannel(storeB, [third.id, first.id, second.id]);
    await setChannelSelection(storeB, first.id, { featured: true });
    await setChannelSelection(storeB, second.id, { published: false });

    const listed = ids(await getStoreProducts(storeB, { limit: 200 })).filter((id) =>
      [first.id, second.id, third.id].includes(id),
    );
    expect(listed).toEqual([third.id, first.id]);
    expect(ids(await getStoreProducts(storeB, { featured: true }))).toContain(first.id);
    expect(ids(await getStoreProducts(storeB, { featured: true }))).not.toContain(third.id);

    const positions = (await listChannelProducts(storeB)).map((p) => p.productId);
    expect(positions.indexOf(third.id)).toBeLessThan(positions.indexOf(first.id));
  });
});

describe("prices and versions come from the catalogue", () => {
  it("charges the catalogue price in every channel, including after a catalogue change", async () => {
    const created = (await createProduct(storeA, product("priced", 4000)))!;
    await addToChannel(storeB, [created.id]);
    await updateProduct(storeA, created.id, { price: 4500 });

    const lines = normalizeOrderLines({
      productId: created.id,
      productName: "priced",
      pricePerUnit: 1,
      quantity: 2,
    } as never);
    const snapshot = await loadCatalogSnapshot(storeB, lines, new Date().toISOString());
    expect(priceCartLines(snapshot, lines).subtotal).toBe(9000);
  });

  it("raises the version of every catalogue row on each change, not on channel changes", async () => {
    const created = (await createProduct(storeA, product("versioned", 100)))!;
    expect(created.version).toBe(1);

    await updateProduct(storeA, created.id, { name: "versioned v2" });
    await setChannelSelection(storeA, created.id, { featured: true });
    const row = await storeA.select().from(schema.products).where(eq(schema.products.id, created.id)).then((r) => r[0]);
    expect(row?.version).toBe(2);

    const now = new Date().toISOString();
    await storeA.insert(schema.productVariants).values({
      id: "v-versioned", productId: created.id, variations: "{}", price: 100, sku: "V-VERSIONED", createdAt: now, updatedAt: now,
    });
    await storeA.update(schema.productVariants).set({ price: 150 }).where(eq(schema.productVariants.id, "v-versioned"));
    await storeA.insert(schema.productImages).values({ id: "i-versioned", productId: created.id, src: "x.jpg", createdAt: now, updatedAt: now });
    await storeA.update(schema.productImages).set({ position: 2 }).where(eq(schema.productImages.id, "i-versioned"));
    await storeA.insert(schema.productCategories).values({ id: "c-versioned", name: "C", slug: "c-versioned", createdAt: now, updatedAt: now });
    await storeA.update(schema.productCategories).set({ name: "C2" }).where(eq(schema.productCategories.id, "c-versioned"));

    const [variant] = await storeA.select().from(schema.productVariants).where(eq(schema.productVariants.id, "v-versioned"));
    const [image] = await storeA.select().from(schema.productImages).where(eq(schema.productImages.id, "i-versioned"));
    const [category] = await storeA.select().from(schema.productCategories).where(eq(schema.productCategories.id, "c-versioned"));
    expect([variant.version, image.version, category.version]).toEqual([2, 2, 2]);
  });
});

describe("the selection is enforced everywhere a channel sells", () => {
  const linesFor = (productId: string) =>
    normalizeOrderLines({ productId, productName: "x", pricePerUnit: 1, quantity: 1 } as never);

  it("refuses an order for a product the channel does not carry, even if published elsewhere", async () => {
    const created = (await createProduct(storeA, product("a-only", 700)))!;
    const lines = linesFor(created.id);

    expect(findProductNotCarried(await loadCatalogSnapshot(storeB, lines, new Date().toISOString()), lines)).toBe(created.id);
    await addToChannel(storeB, [created.id]);
    expect(findProductNotCarried(await loadCatalogSnapshot(storeB, lines, new Date().toISOString()), lines)).toBeNull();
  });

  it("serves a landing-page product only when the channel carries it, published or not", async () => {
    const created = (await createProduct(storeA, product("lp-product", 800)))!;

    expect(await getStoreProductByHandle(storeB, created.handle, { allowUnlisted: true })).toBeNull();
    await ensureInChannel(storeB, created.id);
    expect(await getStoreProductByHandle(storeB, created.handle, { allowUnlisted: true })).not.toBeNull();
    expect(await getStoreProductByHandle(storeB, created.handle)).toBeNull();
    expect(ids(await getStoreProducts(storeB, {}))).not.toContain(created.id);
  });

  it("creates a catalogue product with no store set, carried by no store", async () => {
    const app = createPool(harness.url, "codflow_app");
    try {
      const created = await withStore(app, null, (db) => createProduct(db, product("no-store", 500)), TEST_MERCHANT_ID);
      expect(created?.inChannel).toBe(false);
    } finally {
      await app.end();
    }
  });

  it("sees orders and other stores' selections across the account before a delete", async () => {
    const platform = harness.platform as never;
    const created = (await createProduct(storeA, product("usage", 600)))!;
    expect(await productUsage(platform, created.id, TEST_STORE_ID)).toEqual({ hasOrders: false, otherStores: 0 });

    await addToChannel(storeB, [created.id]);
    expect(await productUsage(platform, created.id, TEST_STORE_ID)).toEqual({ hasOrders: false, otherStores: 1 });
  });

  it("accepts a reorder only when it lists every product of the store exactly once", () => {
    expect(isCompleteOrder(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(isCompleteOrder(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(isCompleteOrder(["a", "b"], ["a", "a"])).toBe(false);
    expect(isCompleteOrder(["a", "b"], ["a", "x"])).toBe(false);
  });
});
