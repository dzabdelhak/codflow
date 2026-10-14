/**
 * Landing Pages — Slice 4: public store endpoint on real PostgreSQL.
 *
 * The real store router + real error handler + real store-auth middleware
 * against real migrations. Covers the public contract: published resolves
 * with the full store-product shape, draft/archived/unknown 404 identically,
 * and every render increments views atomically (proven with concurrent GETs).
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
  for (let i = 1; i <= 3; i++) {
    await db.insert(schema.landingPageImages).values({
      id: `${slug}-img-${i}`, landingPageId: slug,
      r2Key: `landing/${slug}-${i}.jpg`, src: `https://m.example/${slug}-${i}.jpg`,
      altText: `صورة ${i}`, source: "upload", position: i, createdAt: now,
    });
  }
}

describe("Slice 4 — public GET /store/landing-pages/{slug} (real PostgreSQL + store auth)", () => {
  beforeAll(async () => {
    await seedStore();
  });

  it("published LP resolves with the ordered stack and the full product shape", async () => {
    const { id, handle } = await seedProduct();
    await seedPublishedLp("live-page", id);

    const res = await getAndSettle("/store/landing-pages/live-page");
    expect(res.status).toBe(200);
    const body: any = await res.json();

    expect(body.data).toMatchObject({
      slug: "live-page", status: "published", imageGap: 0,
    });
    expect(body.data.images).toHaveLength(3);
    expect(body.data.images[0]).toMatchObject({ position: 1, altText: "صورة 1" });
    expect(body.data.images.map((i: any) => i.src)).toEqual([
      "https://m.example/live-page-1.jpg",
      "https://m.example/live-page-2.jpg",
      "https://m.example/live-page-3.jpg",
    ]);

    // The product arrives in the exact store-product shape the product page
    // consumes — variants/offers/inventory included.
    expect(body.data.product).toMatchObject({
      id, handle, price: 5000, inventory: 10,
    });
    expect(Array.isArray(body.data.product.offers)).toBe(true);
  });

  it("draft, archived, and unknown slugs all 404 identically — nothing leaks", async () => {
    const { id } = await seedProduct();
    const now = NOW();
    await db.insert(schema.landingPages).values({
      id: "draft-page", slug: "draft-page", name: "Draft", productId: id,
      status: "draft", createdAt: now, updatedAt: now,
    });
    await db.insert(schema.landingPages).values({
      id: "archived-page", slug: "archived-page", name: "Archived", productId: id,
      status: "archived", createdAt: now, updatedAt: now,
    });

    for (const slug of ["draft-page", "archived-page", "never-existed"]) {
      const res = await getAndSettle(`/store/landing-pages/${slug}`);
      expect(res.status).toBe(404);
      expect(((await res.json()) as any).code).toBe("LANDING_PAGE_NOT_FOUND");
    }
  });

  it("every GET increments views — 25 concurrent GETs count exactly 25", async () => {
    const { id } = await seedProduct();
    await seedPublishedLp("counted-page", id);

    // The view increment is handed to waitUntil — getAndSettle settles every
    // deferred write before the response is returned to the test.
    await Promise.all(
      Array.from({ length: 25 }, () => getAndSettle("/store/landing-pages/counted-page")),
    );

    const row = await db.select().from(schema.landingPages)
      .where(eq(schema.landingPages.slug, "counted-page")).then(first);
    expect(row?.views).toBe(25);
  });

  it("missing store key is rejected before anything renders", async () => {
    const res = await app.request("/store/landing-pages/live-page", {}, env());
    expect(res.status).toBe(401);
  });
});
