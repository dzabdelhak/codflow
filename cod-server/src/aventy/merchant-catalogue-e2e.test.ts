import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import aventyRoutes from "@/endpoints/aventy/routes";
import merchantRoutes from "@/endpoints/merchant/routes";
import productsRoutes from "@/endpoints/products/routes";
import { productStockRouter } from "@/endpoints/stock/routes";
import channelProductsRoutes from "@/endpoints/channel-products/routes";
import productGroupsRoutes from "@/endpoints/product-groups/routes";
import shippingProfilesRoutes from "@/endpoints/shipping-profiles/routes";
import usersRoutes from "@/endpoints/users/routes";
import { aventyCatalogue, aventyDelivery, aventyTeam } from "@/middleware/aventyOwned";
import { DEMO_CATALOGUE, demoAventyClient } from "./demo-client";

let harness: TestDb;
let database: Database;

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.use("/api/products/*", aventyCatalogue);
app.use("/api/product-groups/*", aventyCatalogue);
app.use("/api/shipping-profiles/*", aventyDelivery);
app.use("/api/users/*", aventyTeam);
app.route("/api/shipping-profiles", shippingProfilesRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/product-groups", productGroupsRoutes);
app.route("/api/aventy", aventyRoutes);
app.route("/api/products", productsRoutes);
app.route("/api/products", productStockRouter);
app.route("/api/channel-products", channelProductsRoutes);
app.route("/api/merchant", merchantRoutes);

const client = demoAventyClient();
const call = (apiKey: string, method: string, path: string, body?: unknown, storeId?: string) =>
  app.request(
    path,
    {
      method,
      headers: { "X-API-Key": apiKey, ...(storeId ? { "X-Store-Id": storeId } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    { DATABASE: database, AVENTY_CLIENT: client, STORE_BASE_DOMAIN: "codflow.test" } as never,
  );

beforeAll(async () => {
  harness = await createTestDb();
  for (const [merchant, key] of [["aventy-lina", "key-lina"], ["m-plain", "key-plain"], ["aventy-race", "key-race"]]) {
    await harness.createMerchant(merchant);
    await harness.platform.query(
      `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
       values ($1, 'Admin', $2, 'admin', $3, $4, now(), now())`,
      [`u-${merchant}`, `${merchant}@x.test`, key, merchant],
    );
  }
  const appPool = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("a merchant arriving from Aventy", () => {
  it("gets its Aventy products and delivery grid before it has any channel, once", async () => {
    const first = await call("key-lina", "POST", "/api/aventy/catalogue/import");
    expect(first.status).toBe(200);
    expect((await first.json()).data).toEqual({ linked: true, listed: DEMO_CATALOGUE.length, applied: DEMO_CATALOGUE.length });
    const again = await call("key-lina", "POST", "/api/aventy/catalogue/import");
    expect((await again.json()).data).toMatchObject({ applied: 0 });

    const { rows } = await harness.platform.query(
      "select count(*)::int as n, count(*) filter (where has_variants)::int as variants from products where merchant_id = 'aventy-lina' and aventy_id is not null",
    );
    expect(rows[0]).toEqual({ n: DEMO_CATALOGUE.length, variants: 3 });
    const listed = await harness.platform.query("select count(*)::int as n from channel_products cp join stores s on s.id = cp.store_id where s.merchant_id = 'aventy-lina'");
    expect(listed.rows[0].n).toBe(0);
    const grid = await harness.platform.query(
      "select p.name, p.is_default, count(r.id)::int as rules from shipping_profiles p join shipping_rules r on r.profile_id = p.id where p.merchant_id = 'aventy-lina' group by p.id",
    );
    expect(grid.rows).toEqual([{ name: "Aventy", is_default: true, rules: 58 }]);
  });

  it("creates a landing page and a store from those products", async () => {
    const { rows } = await harness.platform.query<{ id: string }>(
      "select id from products where merchant_id = 'aventy-lina' and aventy_id in ('av-1002', 'av-1007', 'av-1009') order by aventy_id",
    );
    const landing = await call("key-lina", "POST", "/api/merchant/stores", {
      type: "landing", name: "Casque", subdomain: "lina-casque", productIds: [rows[0].id], templateId: "flash",
    });
    expect(landing.status).toBe(201);
    const store = await call("key-lina", "POST", "/api/merchant/stores", {
      type: "store", name: "Maison Lina", subdomain: "maison-lina", productIds: rows.map((r) => r.id), templateId: "electro",
    });
    expect(store.status).toBe(201);
    const { data } = (await store.json()) as { data: { id: string } };
    const published = await harness.platform.query("select count(*)::int as n from channel_products where store_id = $1 and published", [data.id]);
    expect(published.rows[0].n).toBe(3);
  });

  it("applies concurrent copies of one merchant's catalogue one after the other", async () => {
    const results = await Promise.all([1, 2, 3].map(() => call("key-race", "POST", "/api/aventy/catalogue/import")));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const applied = await Promise.all(results.map(async (r) => ((await r.json()) as { data: { applied: number } }).data.applied));
    expect(applied.sort((a, b) => a - b)).toEqual([0, 0, DEMO_CATALOGUE.length]);
  });

  it("lets an Aventy merchant read its products and choose them per store, but not change them", async () => {
    const { rows: [store] } = await harness.platform.query<{ id: string }>("select id from stores where merchant_id = 'aventy-lina' and channel_type = 'store'");
    const { rows: [product] } = await harness.platform.query<{ id: string; has_variants: boolean }>(
      "select id from products where merchant_id = 'aventy-lina' and aventy_id = 'av-1002'",
    );
    const { rows: [variant] } = await harness.platform.query<{ product_id: string; id: string }>(
      "select v.product_id, v.id from product_variants v join products p on p.id = v.product_id where p.merchant_id = 'aventy-lina' limit 1",
    );
    const refused = async (method: string, path: string, body?: unknown) => {
      const res = await call("key-lina", method, path, body, store.id);
      return { status: res.status, code: ((await res.json()) as { code?: string }).code };
    };
    const managed = { status: 403, code: "CATALOGUE_MANAGED_BY_AVENTY" };

    expect((await call("key-lina", "GET", "/api/products", undefined, store.id)).status).toBe(200);
    expect(await refused("POST", "/api/products", { name: "Local", price: 1000 })).toEqual(managed);
    expect(await refused("PATCH", `/api/products/${product.id}`, { price: 1 })).toEqual(managed);
    expect(await refused("PATCH", `/api/products/${product.id}`, { showInStore: true, price: 1 })).toEqual(managed);
    expect(await refused("PATCH", `/api/products/${product.id}/status`, { status: "ARCHIVED" })).toEqual(managed);
    expect(await refused("DELETE", `/api/products/${product.id}`)).toEqual(managed);
    expect(await refused("POST", `/api/products/${product.id}/stock/adjust`, { quantity: 5, type: "IN" })).toEqual(managed);
    expect(await refused("PATCH", `/api/products/${variant.product_id}/variants/${variant.id}`, { price: 1 })).toEqual(managed);
    expect(await refused("POST", "/api/product-groups", { name: "Promo" })).toEqual(managed);

    const hide = await call("key-lina", "PATCH", `/api/products/${product.id}`, { showInStore: false }, store.id);
    expect(hide.status).toBe(200);
    const { rows: [state] } = await harness.platform.query("select published from channel_products where store_id = $1 and product_id = $2", [store.id, product.id]);
    expect(state.published).toBe(false);
    expect((await harness.platform.query("select price from products where id = $1", [product.id])).rows[0].price).toBe(7500);
  });

  it("leaves an Aventy merchant's delivery grid and team to Aventy, but not its own API key", async () => {
    const code = async (res: Response) => ((await res.json()) as { code?: string }).code;
    const profile = await call("key-lina", "POST", "/api/shipping-profiles", { name: "Local" });
    expect([profile.status, await code(profile)]).toEqual([403, "DELIVERY_MANAGED_BY_AVENTY"]);
    expect((await call("key-lina", "GET", "/api/shipping-profiles")).status).toBe(200);
    const invite = await call("key-lina", "POST", "/api/users", { name: "Agent", email: "agent@x.test", role: "staff" });
    expect([invite.status, await code(invite)]).toEqual([403, "TEAM_MANAGED_BY_AVENTY"]);
    expect((await call("key-lina", "POST", "/api/users/u-aventy-lina/api-key/rotate")).status).toBe(200);

    const { rows } = await harness.platform.query("select channel_type, cart_enabled from stores where merchant_id = 'aventy-lina' order by channel_type");
    expect(rows).toEqual([{ channel_type: "landing", cart_enabled: false }, { channel_type: "store", cart_enabled: true }]);
  });

  it("lets a merchant that did not come from Aventy create products", async () => {
    const res = await call("key-plain", "POST", "/api/products", { name: "Local", handle: "local", price: 1000, sku: "LOCAL-1" });
    expect(res.status).toBe(201);
  });

  it("imports nothing for a merchant that did not come from Aventy", async () => {
    const res = await call("key-plain", "POST", "/api/aventy/catalogue/import");
    expect((await res.json()).data).toEqual({ linked: false });
  });
});
