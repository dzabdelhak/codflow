/**
 * Server-side conversions (ticket 12) on PostgreSQL: a storefront order queues
 * one conversion per configured provider in the jobs table, in the order's own
 * transaction; the worker sends each with the order id as its deduplication
 * id, retries outages and records refusals. Provider APIs are faked at fetch.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import type pg from "pg";
import type { AppContext } from "@/types";
import { createPool, requestScope, type Database } from "@/db/scope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import { createTestDb, TEST_MERCHANT_ID, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import * as schema from "@/db/schema";
import storeRouter from "@/endpoints/store/routes";
import { getStoreConfig } from "../../../cod-shared/queries/store";
import { runDueJobs } from "@/platform/jobs";
import { updateOrderStatus, updateOrderStatusWebhook } from "@/endpoints/orders/queries";
import { CONVERSION_JOB, conversionJobHandler, enqueueConversions } from "./conversions";

let harness: TestDb;
let database: Database;
let app: OpenAPIHono<AppContext>;
let other: string;
const NOW = () => new Date().toISOString();

type Call = { url: string; body: any };
let calls: Call[] = [];
let respond: (url: string) => Response | undefined = () => undefined;

function fakeProviders() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const custom = respond(url);
    if (custom) return custom;
    if (url.includes("graph.facebook.com")) return Response.json({ events_received: 1, fbtrace_id: "fb-trace" });
    if (url.includes("business-api.tiktok.com")) return Response.json({ code: 0, message: "OK", request_id: "tt-req" });
    if (url.includes("tr.snapchat.com")) return Response.json({ status: "VALID", request_id: "sc-req" });
    if (url.includes("google-analytics.com")) return new Response(null, { status: 204 });
    throw new Error(`unexpected fetch ${url}`);
  });
}

async function setTracking(storeId: string, values: Record<string, unknown>) {
  const row = {
    pixel_id: null,
    access_token: "",
    conversion_event: "Purchase",
    enabled: true,
    consent_required: false,
    tiktok_pixel_id: null,
    tiktok_access_token: null,
    snap_pixel_id: null,
    snap_access_token: null,
    ga4_measurement_id: null,
    ga4_api_secret: null,
    google_ads_id: null,
    google_ads_label: null,
    ...values,
  };
  const columns = Object.keys(row);
  await harness.platform.query("delete from store_pixel_config where store_id = $1", [storeId]);
  await harness.platform.query(
    `insert into store_pixel_config (id, store_id, created_at, updated_at, ${columns.join(", ")})
     values ($1, $2, now()::text, now()::text, ${columns.map((_, i) => `$${i + 3}`).join(", ")})`,
    [`pc-${storeId}`, storeId, ...Object.values(row)],
  );
}

const ALL_PROVIDERS = {
  pixel_id: "1111111111111111",
  access_token: "EAAG-store",
  tiktok_pixel_id: "TIKTOKPIXEL000000001",
  tiktok_access_token: "tt-token",
  snap_pixel_id: "6b9d1f3a-1111-4c2d-9e8f-1234567890ab",
  snap_access_token: "snap-token",
  ga4_measurement_id: "G-ABC123DEF4",
  ga4_api_secret: "ga-secret",
  google_ads_id: "AW-123456789",
  google_ads_label: "abcDEF123",
};

function order(body: Record<string, unknown> = {}, store = TEST_STORE_ID) {
  return app.request("/store/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "conversion-test", "X-Test-Store": store },
    body: JSON.stringify({
      customerName: "Amina Test",
      phone: "0550123456",
      wilayaId: 16,
      communeId: "c-16-001",
      address: "Rue des tests",
      deliveryType: "home",
      productId: "p-shirt",
      productName: "Shirt",
      pricePerUnit: 2500,
      quantity: 1,
      ...body,
    }),
  });
}

async function placeOrder(body: Record<string, unknown> = {}, store = TEST_STORE_ID): Promise<string> {
  const res = await order(body, store);
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { orderId: string } }).data.orderId;
}

const jobsFor = async (orderId: string) =>
  (
    await harness.platform.query(
      "select payload->>'provider' as provider, payload->>'eventName' as event, status, attempts, last_error, result from jobs where payload->>'orderId' = $1 order by 1",
      [orderId],
    )
  ).rows;

const work = (platform: pg.Pool = database.platform) => runDueJobs(platform, { [CONVERSION_JOB]: conversionJobHandler(platform) });

beforeAll(async () => {
  harness = await createTestDb();
  other = await harness.createStore("conv-other", [], TEST_MERCHANT_ID);
  const appPool = createPool(harness.url, "codflow_app", 10);
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
  app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
  app.use("*", async (c, next) => {
    c.env = { DATABASE: database } as never;
    await next();
  });
  app.use("*", requestScope(async (c) => ({ storeId: c.req.header("X-Test-Store") ?? TEST_STORE_ID, merchantId: TEST_MERCHANT_ID })));
  app.onError(errorHandler);
  app.route("/store", storeRouter);

  await harness.setStore({ name: "Nour", orderPrefix: "NOUR", domain: "nour.example", createdAt: NOW(), updatedAt: NOW() });
  await harness.platform.query("update stores set order_prefix = 'OTHR', domain = 'other.example' where id = $1", [other]);
  await harness.platform.query("update stores set order_limit_minutes = 0");
  await harness.db.insert(schema.products).values({
    id: "p-shirt", name: "Shirt", handle: "shirt", price: 2500, sku: "SHIRT", inventory: 1000, createdAt: NOW(), updatedAt: NOW(),
  });
  await harness.platform.query(
    "insert into channel_products (store_id, product_id, published, position, created_at, updated_at) values ($1, 'p-shirt', true, 0, now()::text, now()::text) on conflict do nothing",
    [other],
  );
  await harness.db.insert(schema.landingPages).values({
    id: "lp-ramadan", slug: "lp-ramadan", name: "Ramadan", productId: "p-shirt", status: "published", publishedAt: NOW(), createdAt: NOW(), updatedAt: NOW(),
  });
  await harness.db.insert(schema.shippingProfiles).values({ id: "sp", name: "Default", isDefault: true, createdAt: NOW(), updatedAt: NOW() });
  await harness.db.insert(schema.shippingRules).values({
    id: "sr", profileId: "sp", wilayaId: 16, homePrice: 400, stopDeskPrice: 250, homeEnabled: true, stopDeskEnabled: true, createdAt: NOW(),
  });
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

beforeEach(async () => {
  calls = [];
  respond = () => undefined;
  fakeProviders();
  await harness.platform.query("delete from jobs");
  await setTracking(TEST_STORE_ID, ALL_PROVIDERS);
  await harness.platform.query("delete from store_pixel_config where store_id = $1", [other]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("an order queues its conversions", () => {
  it("one per configured provider, in the order's transaction, and never twice", async () => {
    const orderId = await placeOrder();
    expect(await jobsFor(orderId)).toEqual(
      ["ga4", "meta", "snap", "tiktok"].map((provider) => expect.objectContaining({ provider, event: "Purchase", status: "pending" })),
    );
    await enqueueConversions(await harness.connect(), { orderId, stage: "checkout" });
    expect(await jobsFor(orderId)).toHaveLength(4);
  });

  it("only at the stage the merchant optimises for", async () => {
    await setTracking(TEST_STORE_ID, { ...ALL_PROVIDERS, conversion_event: "Purchase_Delivered" });
    const orderId = await placeOrder();
    expect(await jobsFor(orderId)).toEqual([]);
    expect(await enqueueConversions(await harness.connect(), { orderId, stage: "delivered" })).toBe(4);
  });

  it("not at all for a shopper who refused tracking on a channel that asks for consent", async () => {
    await setTracking(TEST_STORE_ID, { ...ALL_PROVIDERS, consent_required: true });
    const refused = await placeOrder({ attribution: { consent: false } });
    const silent = await placeOrder({ phone: "0550123457" });
    const accepted = await placeOrder({ phone: "0550123458", attribution: { consent: true } });
    expect(await jobsFor(refused)).toEqual([]);
    expect(await jobsFor(silent)).toEqual([]);
    expect(await jobsFor(accepted)).toHaveLength(4);
  });

  it("whichever path moves the order to the stage, dashboard, dispatch or carrier", async () => {
    await setTracking(TEST_STORE_ID, { ...ALL_PROVIDERS, conversion_event: "Purchase_Delivered" });
    const direct = await placeOrder();
    const viaCarrier = await placeOrder({ phone: "0550123461" });
    const db = await harness.connect();
    await updateOrderStatus(db, direct, "delivered");
    await updateOrderStatusWebhook(db, viaCarrier, "delivered", "webhook:test");
    expect(await jobsFor(direct)).toHaveLength(4);
    expect(await jobsFor(viaCarrier)).toHaveLength(4);
  });

  it("keeping the visit's UTMs and click ids on the order and in the payload sent to Aventy", async () => {
    const orderId = await placeOrder({
      attribution: JSON.stringify({
        utmSource: "facebook",
        utmMedium: "cpc",
        utmCampaign: "ramadan-2026",
        utmContent: "video-a",
        utmTerm: "robe",
        fbclid: "IwAR-1",
        gclid: "Cj0-1",
        ttclid: "E.C.P-1",
        ttp: "ttp-cookie",
        gaClientId: "GA1.1.123.456",
      }),
    });
    const { rows: [row] } = await harness.platform.query(
      "select utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, ttclid, ad_cookies from orders where id = $1",
      [orderId],
    );
    expect(row).toEqual({
      utm_source: "facebook",
      utm_medium: "cpc",
      utm_campaign: "ramadan-2026",
      utm_content: "video-a",
      utm_term: "robe",
      fbclid: "IwAR-1",
      gclid: "Cj0-1",
      ttclid: "E.C.P-1",
      ad_cookies: { ttp: "ttp-cookie", gaClientId: "GA1.1.123.456" },
    });
    const outbound = await harness.db.select().from(schema.outboundOrders).where(eq(schema.outboundOrders.orderId, orderId)).then((r) => r[0]);
    expect(outbound?.payload).toMatchObject({
      journey: { campaign: { source: "facebook", medium: "cpc", name: "ramadan-2026", content: "video-a", term: "robe" } },
    });
  });
});

describe("the worker sends them", () => {
  it("to each provider with the order id as the deduplication id the browser also uses", async () => {
    const orderId = await placeOrder({ attribution: { ttclid: "E.C.P-9", ttp: "ttp-9", gaClientId: "GA1.1.42.99" } });
    expect(await work()).toBe(4);
    expect((await jobsFor(orderId)).map((j) => j.status)).toEqual(["done", "done", "done", "done"]);

    const meta = calls.find((c) => c.url.includes("graph.facebook.com"))!;
    expect(meta.url).toContain("/1111111111111111/events");
    expect(meta.body.data[0]).toMatchObject({ event_name: "Purchase", event_id: orderId, event_source_url: "https://nour.example/thank-you" });

    const tiktok = calls.find((c) => c.url.includes("tiktok"))!;
    expect(tiktok.body).toMatchObject({ event_source_id: "TIKTOKPIXEL000000001" });
    expect(tiktok.body.data[0]).toMatchObject({ event: "CompletePayment", event_id: orderId, user: { ttclid: "E.C.P-9", ttp: "ttp-9" } });
    expect(tiktok.body.data[0].properties).toMatchObject({ value: 2900, currency: "DZD" });

    const snap = calls.find((c) => c.url.includes("snapchat"))!;
    expect(snap.url).toContain("/v3/6b9d1f3a-1111-4c2d-9e8f-1234567890ab/events?");
    expect(snap.body.data[0]).toMatchObject({ event_name: "PURCHASE", event_id: orderId, custom_data: { order_id: orderId } });

    const ga4 = calls.find((c) => c.url.includes("google-analytics"))!;
    expect(ga4.url).toContain("/mp/collect?measurement_id=G-ABC123DEF4");
    expect(ga4.body).toMatchObject({ client_id: "42.99", events: [{ name: "purchase", params: { transaction_id: orderId } }] });

    const { rows: [audit] } = await harness.platform.query("select status, pixel_id, meta_event_id from capi_event_log where order_id = $1", [orderId]);
    expect(audit).toEqual({ status: "sent", pixel_id: "1111111111111111", meta_event_id: "fb-trace" });
  });

  it("to each channel's own pixels only, for two channels of one account", async () => {
    await setTracking(other, { pixel_id: "2222222222222222", access_token: "EAAG-other", tiktok_pixel_id: "TIKTOKPIXEL000000002", tiktok_access_token: "tt-other" });
    const mine = await placeOrder();
    const theirs = await placeOrder({ phone: "0550999999" }, other);
    await work();

    const metaUrls = calls.filter((c) => c.url.includes("graph.facebook.com"));
    expect(metaUrls.find((c) => c.body.data[0].event_id === mine)?.url).toContain("/1111111111111111/");
    expect(metaUrls.find((c) => c.body.data[0].event_id === theirs)?.url).toContain("/2222222222222222/");
    const tiktok = calls.filter((c) => c.url.includes("tiktok"));
    expect(tiktok.find((c) => c.body.data[0].event_id === theirs)?.body.event_source_id).toBe("TIKTOKPIXEL000000002");
    expect(calls.filter((c) => c.url.includes("snapchat")).map((c) => c.body.data[0].event_id)).toEqual([mine]);

    const browserMine = await getStoreConfig(await harness.connect(), TEST_STORE_ID);
    const browserTheirs = await getStoreConfig(await harness.connect(other), other);
    expect([browserMine?.pixelId, browserMine?.trackers.tiktok]).toEqual(["1111111111111111", "TIKTOKPIXEL000000001"]);
    expect([browserTheirs?.pixelId, browserTheirs?.trackers.tiktok, browserTheirs?.trackers.snap]).toEqual([
      "2222222222222222",
      "TIKTOKPIXEL000000002",
      null,
    ]);
  });

  it("tells each provider the landing page the order came from, or the thank-you page", async () => {
    const fromPage = await placeOrder({ landingPageSlug: "lp-ramadan" });
    const unresolved = await placeOrder({ phone: "0550123460", landingPageSlug: "never-existed" });
    await work();
    const sourceOf = (provider: string, orderId: string) => {
      const call = calls.find((c) => c.url.includes(provider) && JSON.stringify(c.body).includes(orderId))!;
      return call.body.data[0].event_source_url ?? call.body.data[0].page?.url;
    };
    expect(sourceOf("graph.facebook.com", fromPage)).toBe("https://nour.example/lp/lp-ramadan");
    expect(sourceOf("tiktok", fromPage)).toBe("https://nour.example/lp/lp-ramadan");
    expect(sourceOf("snapchat", fromPage)).toBe("https://nour.example/lp/lp-ramadan");
    expect(sourceOf("graph.facebook.com", unresolved)).toBe("https://nour.example/thank-you");
  });

  it("records a conversion it cannot send for want of a token, instead of dropping it silently", async () => {
    await setTracking(TEST_STORE_ID, { pixel_id: "1111111111111111", tiktok_pixel_id: "TIKTOKPIXEL000000001" });
    const orderId = await placeOrder();
    await work();
    expect(await jobsFor(orderId)).toEqual([
      expect.objectContaining({ provider: "meta", status: "done", result: { skipped: "no_access_token" } }),
      expect.objectContaining({ provider: "tiktok", status: "done", result: { skipped: "no_access_token" } }),
    ]);
    expect(calls).toEqual([]);
    const { rows: [audit] } = await harness.platform.query("select status, pixel_id from capi_event_log where order_id = $1", [orderId]);
    expect(audit).toEqual({ status: "skipped", pixel_id: "1111111111111111" });
  });

  it("retries a provider outage later, and still sends after the app restarts", async () => {
    respond = (url) => (url.includes("tiktok") ? new Response("busy", { status: 503 }) : undefined);
    const orderId = await placeOrder();
    await work();
    expect((await jobsFor(orderId)).find((j) => j.provider === "tiktok")).toMatchObject({ status: "pending", attempts: 1 });

    respond = () => undefined;
    const restarted = createPool(harness.url, "codflow_platform");
    await harness.platform.query("update jobs set run_at = now()");
    await work(restarted);
    await restarted.end();
    expect((await jobsFor(orderId)).find((j) => j.provider === "tiktok")).toMatchObject({ status: "done", attempts: 2 });
  });

  it("retries TikTok's rate limiting, which arrives as HTTP 200", async () => {
    respond = (url) => (url.includes("tiktok") ? Response.json({ code: 40100, message: "Too many requests" }) : undefined);
    const orderId = await placeOrder();
    await work();
    expect((await jobsFor(orderId)).find((j) => j.provider === "tiktok")).toMatchObject({ status: "pending", attempts: 1 });
  });

  it("records a refusal instead of retrying it", async () => {
    respond = (url) =>
      url.includes("graph.facebook.com") ? Response.json({ error: { message: "Invalid parameter" } }, { status: 400 }) : undefined;
    const orderId = await placeOrder();
    await work();
    expect((await jobsFor(orderId)).find((j) => j.provider === "meta")).toMatchObject({ status: "failed", last_error: "Invalid parameter" });
    const { rows: [audit] } = await harness.platform.query("select status, error from capi_event_log where order_id = $1", [orderId]);
    expect(audit).toEqual({ status: "failed", error: "Invalid parameter" });
  });

  it("skips a conversion whose provider was removed after it was queued", async () => {
    const orderId = await placeOrder();
    await setTracking(TEST_STORE_ID, { ...ALL_PROVIDERS, snap_access_token: null });
    await work();
    expect((await jobsFor(orderId)).find((j) => j.provider === "snap")).toMatchObject({ status: "done", result: { skipped: "not_configured" } });
    expect(calls.some((c) => c.url.includes("snapchat"))).toBe(false);
  });
});
