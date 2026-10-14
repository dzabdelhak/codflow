/**
 * The landing channel type (ticket 08), on PostgreSQL through the real auth,
 * dashboard scope and storefront resolution: a landing sells one main product,
 * takes orders through the same queue as a store, replaces its product only by
 * an explicit selection, and applies its rule while that product is unavailable.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { storeAuthMiddleware } from "@/middleware/storeAuth";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import merchantRoutes from "../merchant/routes";
import channelProductsRoutes from "../channel-products/routes";
import storeRoutes from "../store/routes";
import landingChannelRoutes from "./routes";

const KEY = "storefront-landing-key";
let harness: TestDb;
let database: Database;
let merchant: string;
let homeStore: string;
let landing: string;

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.use("/store/*", storeAuthMiddleware);
app.route("/api/merchant", merchantRoutes);
app.route("/api/channel-products", channelProductsRoutes);
app.route("/api/landing-channel", landingChannelRoutes);
app.route("/store", storeRoutes);

const env = () => ({ DATABASE: database, STORE_BASE_DOMAIN: "codflow.test", STOREFRONT_SERVICE_KEY: KEY }) as never;

function dashboard(method: string, path: string, body?: unknown, storeId?: string) {
  const headers: Record<string, string> = { "X-API-Key": "key-landing", "Content-Type": "application/json" };
  if (storeId) headers["X-Store-Id"] = storeId;
  return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env());
}

function storefront(path: string, init: { method?: string; body?: unknown } = {}) {
  return app.request(
    path,
    {
      method: init.method ?? "GET",
      headers: { "X-Storefront-Key": KEY, "X-Channel-Host": "nour-landing.codflow.test", "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    env(),
  );
}

const placeOrder = (productId: string, phone: string) =>
  storefront("/store/orders", {
    method: "POST",
    body: {
      customerName: "Amina Test",
      phone,
      wilayaId: 16,
      communeId: "c-16-001",
      address: "Rue des tests",
      deliveryType: "home",
      productId,
      productName: "Serum",
      pricePerUnit: 3200,
      quantity: 1,
    },
  });

async function landingRows() {
  return (await harness.platform.query("select product_id from channel_products where store_id = $1 order by product_id", [landing])).rows.map(
    (r) => r.product_id,
  );
}

beforeAll(async () => {
  harness = await createTestDb();
  merchant = await harness.createMerchant("m-landing");
  homeStore = await harness.createStore("landing-home", [], merchant);
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-landing', 'Landing', 'landing@x.test', 'admin', 'key-landing', $1, now(), now())`,
    [merchant],
  );
  await harness.platform.query(
    `insert into products (id, merchant_id, name, handle, price, sku, inventory, created_at, updated_at) values
       ('serum', $1, 'Serum', 'serum', 3200, 'SERUM', 5, '', ''), ('cream', $1, 'Cream', 'cream', 2100, 'CREAM', 5, '', '')`,
    [merchant],
  );
  const appPool = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("creating a landing channel", () => {
  it("refuses a landing without exactly one main product, or with a store template", async () => {
    const none = await dashboard("POST", "/api/merchant/stores", { type: "landing", name: "L", subdomain: "l-none" });
    const two = await dashboard("POST", "/api/merchant/stores", { type: "landing", name: "L", subdomain: "l-two", productIds: ["serum", "cream"] });
    const storeTemplate = await dashboard("POST", "/api/merchant/stores", {
      type: "landing", name: "L", subdomain: "l-tpl", productIds: ["serum"], templateId: "theme01",
    });
    expect([none.status, two.status, storeTemplate.status]).toEqual([400, 400, 400]);
    expect(await none.json()).toMatchObject({ context: { field: "productIds" } });
    expect(await storeTemplate.json()).toMatchObject({ context: { field: "templateId" } });
  });

  it("saves its type, main product, rule and landing template, and lists it as a landing", async () => {
    const res = await dashboard("POST", "/api/merchant/stores", {
      type: "landing",
      name: "Nour Serum",
      subdomain: "nour-landing",
      productIds: ["serum"],
      unavailableRule: "hide_order_form",
    });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string; type: string } };
    landing = data.id;
    expect(data.type).toBe("landing");
    const { rows: [row] } = await harness.platform.query("select channel_type, unavailable_rule, theme_id from stores where id = $1", [landing]);
    expect(row).toEqual({ channel_type: "landing", unavailable_rule: "hide_order_form", theme_id: "landing01" });
    expect(await landingRows()).toEqual(["serum"]);

    const list = (await (await dashboard("GET", "/api/merchant/stores")).json()) as { data: Array<{ id: string; type: string }> };
    expect(list.data.find((s) => s.id === homeStore)?.type).toBe("store");
    expect(list.data.find((s) => s.id === landing)?.type).toBe("landing");
  });
});

describe("a published landing", () => {
  beforeAll(async () => {
    for (const status of ["ready", "published"]) {
      expect((await dashboard("PATCH", `/api/merchant/stores/${landing}/status`, { status })).status).toBe(200);
    }
  });

  it("presents its main product to the storefront and takes an order into the outbound queue", async () => {
    const config = (await (await storefront("/store/config")).json()) as { data: { channelType: string } };
    expect(config.data.channelType).toBe("landing");
    const page = (await (await storefront("/store/landing")).json()) as {
      data: { available: boolean; unavailableRule: string; product: { id: string; variants: unknown[] } };
    };
    expect(page.data).toMatchObject({ available: true, unavailableRule: "hide_order_form", product: { id: "serum" } });

    const res = await placeOrder("serum", "0550111222");
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { orderId: string } };
    const queued = await harness.platform.query("select store_id from outbound_orders where order_id = $1", [data.orderId]);
    expect(queued.rows).toEqual([{ store_id: landing }]);
  });

  it("keeps one product: adding or removing through the store selection is refused, and a product created in it stays out", async () => {
    const add = await dashboard("POST", "/api/channel-products", { productIds: ["cream"] }, landing);
    expect(add.status).toBe(409);
    expect(await add.json()).toMatchObject({ code: "LANDING_SINGLE_PRODUCT" });
    expect((await dashboard("DELETE", "/api/channel-products/serum", undefined, landing)).status).toBe(409);

    const scoped = await harness.connect(landing);
    await scoped.execute(
      `insert into products (id, name, handle, price, created_at, updated_at) values ('made-here', 'Made here', 'made-here', 900, '', '')` as never,
    );
    expect(await landingRows()).toEqual(["serum"]);
    await expect(
      scoped.execute(`insert into channel_products (product_id, created_at, updated_at) values ('cream', '', '')` as never),
    ).rejects.toThrow();
    expect(await landingRows()).toEqual(["serum"]);
  });

  it("replaces its main product only through the explicit selection", async () => {
    const res = await dashboard("PUT", "/api/landing-channel/main-product", { productId: "cream" }, landing);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { available: true, mainProduct: { productId: "cream", published: true } } });
    expect(await landingRows()).toEqual(["cream"]);
    expect((await dashboard("PUT", "/api/landing-channel/main-product", { productId: "nope" }, landing)).status).toBe(400);

    await harness.platform.query("update products set status = 'DRAFT' where id = 'serum'");
    const draft = await dashboard("PUT", "/api/landing-channel/main-product", { productId: "serum" }, landing);
    expect(draft.status).toBe(400);
    expect(await draft.json()).toMatchObject({ context: { field: "productId", reason: "unsellable" } });
    expect(await landingRows()).toEqual(["cream"]);
    await harness.platform.query("update products set status = 'ACTIVE' where id = 'serum'");
  });

  it("is not a landing for a store channel", async () => {
    const res = await dashboard("GET", "/api/landing-channel", undefined, homeStore);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NOT_A_LANDING_CHANNEL" });
    expect((await dashboard("PUT", "/api/landing-channel/main-product", { productId: "serum" }, homeStore)).status).toBe(409);
  });
});

describe("when the main product becomes unavailable", () => {
  beforeAll(async () => {
    await harness.platform.query("update products set status = 'ARCHIVED' where id = 'cream'");
  });

  it("still presents it, says it is unavailable, and refuses orders for it", async () => {
    const page = (await (await storefront("/store/landing")).json()) as { data: { available: boolean; product: { id: string } } };
    expect(page.data).toMatchObject({ available: false, product: { id: "cream" } });
    const refused = await placeOrder("cream", "0550111333");
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await refused.json())).not.toContain("SKU");
    const dash = (await (await dashboard("GET", "/api/landing-channel", undefined, landing)).json()) as { data: { available: boolean } };
    expect(dash.data.available).toBe(false);
  });

  it("suspends the public page under the suspend rule, and serves it again once the product is back", async () => {
    const set = await dashboard("PATCH", "/api/landing-channel", { unavailableRule: "suspend" }, landing);
    expect(set.status).toBe(200);
    const suspended = await storefront("/store/config");
    expect(suspended.status).toBe(503);
    expect(await suspended.json()).toMatchObject({ code: "CHANNEL_UNAVAILABLE" });
    const { rows: [store] } = await harness.platform.query("select status from stores where id = $1", [landing]);
    expect(store.status).toBe("published");

    await harness.platform.query("update products set status = 'ACTIVE' where id = 'cream'");
    expect((await storefront("/store/config")).status).toBe(200);
  });

  it("stops presenting a deleted main product", async () => {
    await dashboard("PATCH", "/api/landing-channel", { unavailableRule: "show_unavailable" }, landing);
    await harness.platform.query("update products set deleted_at = now()::text where id = 'cream'");
    const page = (await (await storefront("/store/landing")).json()) as { data: { available: boolean; product: unknown } };
    expect(page.data).toEqual({ unavailableRule: "show_unavailable", available: false, product: null });
    await harness.platform.query("update products set deleted_at = null where id = 'cream'");
    await dashboard("PATCH", "/api/landing-channel", { unavailableRule: "suspend" }, landing);
  });

  it("suspends a landing whose product was unpublished or deleted, but not one whose stock ran out", async () => {
    await harness.platform.query("update products set inventory = 0 where id = 'cream'");
    expect((await storefront("/store/config")).status).toBe(200);
    await harness.platform.query("update products set deleted_at = now()::text where id = 'cream'");
    expect((await storefront("/store/config")).status).toBe(503);
    await harness.platform.query("update products set deleted_at = null where id = 'cream'");
    await harness.platform.query("update channel_products set published = false where store_id = $1", [landing]);
    expect((await storefront("/store/config")).status).toBe(503);
  });
});
