/**
 * Landing Pages — store-hidden products: the showInStore=false contract.
 *
 * A product hidden from the storefront catalog (showInStore=false) is a
 * landing-page-only product: its published LP renders and sells as normal,
 * while the catalog list and the product's own store page stay hidden.
 * Proven end-to-end on real PostgreSQL through the real store router.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { eq } from "drizzle-orm";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import { storeAuthMiddleware } from "@/middleware/storeAuth";
import storeRouter from "../store/routes";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import { first } from "../../../../cod-shared/db/client";

let harness: TestDb;
let db: AppDb;
let database: Database;
let app: OpenAPIHono<AppContext>;
const KEY = "storefront-key-lp-test";
const HOST = "lp-test.codflow.test";

beforeAll(async () => {
  harness = await createTestDb();
  await harness.createStore("lp-store", [HOST]);
  db = await harness.connect("lp-store");
  const appPool = createPool(harness.url, "codflow_app", 30);
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };

  app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
  app.use("/store/*", storeAuthMiddleware);
  app.onError(errorHandler);
  app.route("/store", storeRouter);
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

const NOW = () => new Date().toISOString();
let seq = 0;

const env = () => ({ DATABASE: database, STOREFRONT_SERVICE_KEY: KEY }) as never;
const STORE_HEADERS = { "X-Storefront-Key": KEY, "X-Channel-Host": HOST };

function settleCtx() {
  const pending: Promise<unknown>[] = [];
  const executionCtx = {
    waitUntil: (p: Promise<unknown>) => pending.push(p),
    passThroughOnException: () => {},
    props: {} as Record<string, unknown>,
  };
  return { pending, executionCtx: executionCtx as never };
}

async function getAndSettle(path: string): Promise<Response> {
  const { pending, executionCtx } = settleCtx();
  const res = await app.request(path, { headers: STORE_HEADERS }, env(), executionCtx);
  await Promise.allSettled(pending);
  return res;
}

async function postAndSettle(path: string, body: unknown): Promise<Response> {
  const { pending, executionCtx } = settleCtx();
  const res = await app.request(
    path,
    { method: "POST", headers: { ...STORE_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env(),
    executionCtx,
  );
  await Promise.allSettled(pending);
  return res;
}

async function seedStore(): Promise<string> {
  return "lp-store";
}

async function seedProduct(opts: { showInStore: boolean } = { showInStore: true }): Promise<{ id: string; handle: string }> {
  const id = `prod-lp-${++seq}`;
  const handle = `lp-product-${seq}`;
  await db.insert(schema.products).values({
    id, name: `LP Product ${seq}`, handle, price: 5000,
    sku: `LP-SKU-${seq}`,
    hasVariants: false, inventory: 10, trackInventory: true, lowStockThreshold: 2,
    status: "ACTIVE", visibility: true,
    createdAt: NOW(), updatedAt: NOW(),
  });
  if (!opts.showInStore) {
    await db.update(schema.channelProducts).set({ published: false }).where(eq(schema.channelProducts.productId, id));
  }
  return { id, handle };
}

async function seedPublishedLp(slug: string, productId: string) {
  const now = NOW();
  await db.insert(schema.landingPages).values({
    id: slug, slug, name: `LP ${slug}`, productId, status: "published",
    publishedAt: now, createdAt: now, updatedAt: now,
  });
  await db.insert(schema.landingPageImages).values({
    id: `${slug}-img-1`, landingPageId: slug,
    r2Key: `landing/${slug}-1.jpg`, src: `https://m.example/${slug}-1.jpg`,
    altText: "صورة 1", source: "upload", position: 1, createdAt: now,
  });
}

describe("store-hidden products (showInStore=false) — landing pages keep selling", () => {
  beforeAll(async () => {
    await seedStore();
  });

  it("a store-hidden product renders on its published LP in the full product shape", async () => {
    const { id, handle } = await seedProduct({ showInStore: false });
    await seedPublishedLp("hidden-live", id);

    const res = await getAndSettle("/store/landing-pages/hidden-live");
    expect(res.status).toBe(200);
    const body: any = await res.json();

    expect(body.data.product).toMatchObject({
      id, handle, price: 5000, inventory: 10,
    });
    expect(Array.isArray(body.data.product.offers)).toBe(true);
  });

  it("the same product is absent from the catalog list while visible products remain", async () => {
    const hidden = await seedProduct({ showInStore: false });
    const visible = await seedProduct({ showInStore: true });

    const res = await getAndSettle("/store/products?limit=100");
    expect(res.status).toBe(200);
    const body: any = await res.json();
    const handles = body.data.map((p: any) => p.handle);

    expect(handles).toContain(visible.handle);
    expect(handles).not.toContain(hidden.handle);
  });

  it("the hidden product's own store page 404s", async () => {
    const { handle } = await seedProduct({ showInStore: false });

    const res = await getAndSettle(`/store/products/${handle}`);
    expect(res.status).toBe(404);
  });

  it("orders for the hidden product via its LP succeed — catalog price, attribution, stock", async () => {
    const { id, handle } = await seedProduct({ showInStore: false });
    await seedPublishedLp("hidden-order", id);

    const res = await postAndSettle("/store/orders", {
      customerName: "Hidden Product Buyer",
      phone: "0555987654",
      wilayaId: 16,
      communeId: "c-16-001",
      address: "x",
      deliveryType: "home",
      productId: id,
      productName: `LP Product ${seq}`,
      quantity: 2,
      pricePerUnit: 5000,
      landingPageSlug: "hidden-order",
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.data.price).toBe(10000);

    const order = await db.select().from(schema.orders)
      .where(eq(schema.orders.id, body.data.orderId)).then(first);
    expect(order?.landingPageId).toBe("hidden-order");

    const product = await db.select().from(schema.products)
      .where(eq(schema.products.id, id)).then(first);
    expect(product?.inventory).toBe(8);

    // The handle stays resolvable only through the LP — the store page still 404s.
    const page = await getAndSettle(`/store/products/${handle}`);
    expect(page.status).toBe(404);
  });
});
