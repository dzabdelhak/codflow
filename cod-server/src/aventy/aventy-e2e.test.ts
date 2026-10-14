import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, requestScope, withStore, type Database } from "@/db/scope";
import { createTestDb, TEST_MERCHANT_ID, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import { fakeAventy, product } from "@/test-utils/fake-aventy";
import { drainOutbound, sendNextOutbound } from "@/platform/outbound/worker";
import aventyRoutes from "@/endpoints/aventy/routes";
import transmissionRoutes from "@/endpoints/transmission/routes";
import storeRouter from "@/endpoints/store/routes";
import { createAventyKeyVault } from "./key-vault";
import { saveChannelKey } from "./keys";
import { runAventyHeartbeat, type AventyDeps } from "./sync";
import { aventyDestination } from "./destination";

const KEY_A = "av_key_store_a_0123456789abcdef";
const KEY_B = "av_key_store_b_fedcba9876543210";
const KEY_A2 = "av_key_store_a_replacement_42424242";

let harness: TestDb;
let database: Database;
let sibling: string;
let deps: AventyDeps;
let aventy: ReturnType<typeof fakeAventy>;
const vault = createAventyKeyVault(randomBytes(32).toString("hex"));

const dashboard = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
dashboard.onError(errorHandler);
dashboard.use("/api/*", authMiddleware);
dashboard.use("/api/*", dashboardScope);
dashboard.route("/api/aventy", aventyRoutes);
dashboard.route("/api/transmission", transmissionRoutes);

async function call(method: string, path: string, body?: unknown, env: Record<string, unknown> = {}, storeId = TEST_STORE_ID) {
  const res = await dashboard.request(
    path,
    {
      method,
      headers: { "X-API-Key": "key-aventy-admin", "X-Store-Id": storeId, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    { DATABASE: database, AVENTY_KEY_VAULT: vault, ORDER_DESTINATION: "aventy", ...env } as never,
  );
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) as { data: Record<string, unknown>; code?: string } };
}

const storefront = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
storefront.use("*", async (c, next) => {
  c.env = { DATABASE: database } as never;
  await next();
});
storefront.use("*", requestScope(async () => ({ storeId: TEST_STORE_ID, merchantId: TEST_MERCHANT_ID })));
storefront.onError(errorHandler);
storefront.route("/store", storeRouter);

let phoneSeq = 0;
function placeOrder(productId: string, body: Record<string, unknown> = {}) {
  return storefront.request("/store/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Amina", phone: `0770${String(++phoneSeq).padStart(6, "0")}`, wilayaId: 16, communeId: "c-16-001",
      address: "Rue des tests", deliveryType: "home", productId, productName: "Montre", pricePerUnit: 2500, quantity: 1, ...body,
    }),
  });
}

const productRow = async (aventyId: string) =>
  (await harness.platform.query(
    `select p.id, p.name, p.price, p.source_version as "sourceVersion", p.sku, p.inventory, p.has_variants as "hasVariants",
            (select cp.published from channel_products cp where cp.product_id = p.id and cp.store_id = $2) as published
       from products p where p.aventy_id = $1`,
    [aventyId, TEST_STORE_ID],
  )).rows[0];

beforeAll(async () => {
  harness = await createTestDb();
  sibling = await harness.createStore("aventy-sibling");
  const app = createPool(harness.url, "codflow_app", 6);
  const platform = createPool(harness.url, "codflow_platform", 6);
  database = { app, platform, close: async () => void (await Promise.all([app.end(), platform.end()])) };
  aventy = fakeAventy();
  deps = { app, platform, vault, client: aventy.client };
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-aventy', 'Ops', 'aventy@x.test', 'admin', 'key-aventy-admin', $1, now(), now())`,
    [TEST_MERCHANT_ID],
  );
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("the channel's Aventy key", () => {
  it("is stored encrypted, shown only as its last four characters, and never returned", async () => {
    const log = vi.spyOn(console, "log");
    const saved = await call("PUT", "/api/aventy/key", { key: KEY_A });
    expect(saved.status).toBe(200);
    expect(saved.json.data).toMatchObject({ configured: true, hint: "••••cdef", status: "active", encryptionConfigured: true });
    expect(saved.text).not.toContain(KEY_A);
    expect((await call("GET", "/api/aventy/key")).text).not.toContain(KEY_A);

    const { rows: [row] } = await harness.platform.query("select * from channel_aventy_keys where store_id = $1", [TEST_STORE_ID]);
    expect(JSON.stringify(row)).not.toContain(KEY_A);
    expect(vault.open(TEST_STORE_ID, { ciphertext: row.key_ciphertext, encryptionKeyId: row.encryption_key_id })).toBe(KEY_A);
    expect(JSON.stringify(log.mock.calls)).not.toContain(KEY_A);
    log.mockRestore();
  });

  it("cannot be stored on a platform without an encryption key, or read from another channel", async () => {
    const refused = await call("PUT", "/api/aventy/key", { key: KEY_B }, { AVENTY_KEY_VAULT: null }, sibling);
    expect(refused.status).toBe(422);
    expect(refused.json.code).toBe("AVENTY_NOT_CONFIGURED");
    expect((await call("GET", "/api/aventy/key", undefined, {}, sibling)).json.data).toMatchObject({ configured: false, hint: null });
  });
});

describe("syncing from Aventy", () => {
  it("copies the channel's catalogue and delivery grid on the first heartbeat", async () => {
    aventy.publish(KEY_A, product("watch", 3, { price: 2500 }));
    aventy.publish(KEY_A, product("shirt", 1, {
      sku: null, price: 1800,
      variants: [
        { sku: "SHIRT-RED-M", options: { Couleur: "Rouge", Taille: "M" }, price: null, reserve: 4 },
        { sku: "SHIRT-RED-L", options: { Couleur: "Rouge", Taille: "L" }, price: 1900, reserve: 2 },
      ],
    }));
    aventy.setGrid(KEY_A, { version: 7, rules: [{ wilayaId: 16, home: 400, stopDesk: 250 }, { wilayaId: 31, home: 600, stopDesk: null }] });

    const [result] = await runAventyHeartbeat(deps);
    expect(result).toMatchObject({ storeId: TEST_STORE_ID, state: "synced" });

    expect(await productRow("watch")).toMatchObject({ name: "Produit watch", price: 2500, sourceVersion: 3, sku: "SKU-watch", inventory: 5, published: true });
    expect(await productRow("shirt")).toMatchObject({ hasVariants: true, published: true });
    const { rows: variants } = await harness.platform.query(
      "select v.sku, v.price, v.inventory from product_variants v join products p on p.id = v.product_id where p.aventy_id = 'shirt' order by v.sku",
    );
    expect(variants).toEqual([{ sku: "SHIRT-RED-L", price: 1900, inventory: 2 }, { sku: "SHIRT-RED-M", price: 1800, inventory: 4 }]);
    const { rows: [image] } = await harness.platform.query("select i.src from product_images i join products p on p.id = i.product_id where p.aventy_id = 'watch'");
    expect(image.src).toBe("https://cdn.aventy.test/watch/1.webp");

    const { rows: [grid] } = await harness.platform.query(
      `select sp.id, sp.source_version as "sourceVersion", s.default_shipping_profile_id as "defaultProfile",
              (select json_agg(json_build_object('w', r.wilaya_id, 'home', r.home_price, 'desk', r.stop_desk_price, 'deskOn', r.stop_desk_enabled) order by r.wilaya_id)
                 from shipping_rules r where r.profile_id = sp.id) as rules
         from shipping_profiles sp join stores s on s.id = sp.aventy_store_id where sp.aventy_store_id = $1`,
      [TEST_STORE_ID],
    );
    expect(grid).toMatchObject({ sourceVersion: 7, defaultProfile: grid.id });
    expect(grid.rules).toEqual([{ w: 16, home: 400, desk: 250, deskOn: true }, { w: 31, home: 600, desk: 0, deskOn: false }]);
  });

  it("brings a price change within one heartbeat, and never lets an older version overwrite a newer one", async () => {
    aventy.publish(KEY_A, product("watch", 4, { price: 2700 }));
    await runAventyHeartbeat(deps);
    expect(await productRow("watch")).toMatchObject({ price: 2700, sourceVersion: 4 });

    aventy.publish(KEY_A, product("watch", 2, { price: 1000 }));
    await runAventyHeartbeat(deps);
    expect(await productRow("watch")).toMatchObject({ price: 2700, sourceVersion: 4 });

    const calls = aventy.calls.length;
    await runAventyHeartbeat(deps);
    expect(aventy.calls.slice(calls).map((c) => c.method).filter((m) => m !== "lookup")).toEqual(["heartbeat"]);
  });

  it("sends orders with the versions Aventy priced them with", async () => {
    const { id } = await productRow("watch");
    const res = await placeOrder(id, { pricePerUnit: 2700 });
    expect(res.status).toBe(201);
    const { rows: [entry] } = await harness.platform.query("select payload from outbound_orders order by created_at desc limit 1");
    expect(entry.payload.lines).toEqual([{ sku: "SKU-watch", quantity: 1, unitPrice: 2700, catalogVersion: 4 }]);
    expect(entry.payload.delivery).toMatchObject({ fee: 400, gridVersion: 7, feeToConfirm: false });
  });

  it("unpublishes a product Aventy withdraws, and rebuilds from a snapshot when the cursor is too old", async () => {
    aventy.withdraw(KEY_A, "shirt");
    await runAventyHeartbeat(deps);
    expect(await productRow("shirt")).toMatchObject({ published: false });

    aventy.site(KEY_A).products.delete("watch");
    aventy.publish(KEY_A, product("shirt", 5, { name: "Chemise", sku: "SHIRT-SIMPLE" }));
    aventy.expireCursors(KEY_A);
    await runAventyHeartbeat(deps);
    expect(aventy.calls.some((c) => c.method === "catalogueSnapshot")).toBe(true);
    expect(await productRow("shirt")).toMatchObject({ name: "Chemise", published: true, sourceVersion: 5 });
    expect(await productRow("watch")).toMatchObject({ published: false });
  });

  it("keeps syncing the domains the key grants when one is refused, and records why", async () => {
    await withStore(database.app, sibling, (db) => saveChannelKey(db, vault, sibling, KEY_B), TEST_MERCHANT_ID);
    aventy.site(KEY_B).denied.add("delivery");
    aventy.publish(KEY_B, product("lamp", 1));
    const results = await runAventyHeartbeat(deps);
    expect(results.find((r) => r.storeId === sibling)).toMatchObject({
      state: "synced",
      domains: [{ domain: "catalogue", result: "synced" }, { domain: "delivery", result: "not_permitted" }],
    });
    const sync = await call("GET", "/api/aventy/sync", undefined, {}, sibling);
    expect(sync.json.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "catalogue", lastError: null }),
      expect.objectContaining({ domain: "delivery", lastError: "The channel's Aventy key does not grant this domain" }),
    ]));
  });

  it("never writes the key into an error it records or logs", async () => {
    aventy.site(KEY_B).denied.delete("delivery");
    aventy.site(KEY_B).failWith = new Error(`upstream rejected token ${KEY_B}`);
    aventy.publish(KEY_B, product("lamp", 2));
    const errors = vi.spyOn(console, "error");
    const warns = vi.spyOn(console, "warn");
    await runAventyHeartbeat(deps);
    const { rows } = await harness.platform.query("select last_error from aventy_sync_state where store_id = $1", [sibling]);
    expect(JSON.stringify(rows)).not.toContain(KEY_B);
    expect(JSON.stringify(rows)).toContain("upstream rejected token ••••");
    expect(JSON.stringify([errors.mock.calls, warns.mock.calls])).not.toContain(KEY_B);
    errors.mockRestore();
    warns.mockRestore();
    aventy.site(KEY_B).failWith = null;
  });
});

describe("orders sent to Aventy", () => {
  it("are received once with the channel's identity, even when resent", async () => {
    await harness.platform.query("delete from outbound_orders");
    const destination = aventyDestination(deps);
    const { id } = await productRow("shirt");
    expect((await placeOrder(id, { pricePerUnit: 2500 })).status).toBe(201);
    await drainOutbound(deps.platform, destination);

    const { rows: [sent] } = await harness.platform.query("select id, status, aventy_order_id as remote from outbound_orders");
    expect(sent).toMatchObject({ status: "sent" });
    expect(aventy.site(KEY_A).orders.get(sent.id)).toMatchObject({ remoteId: sent.remote });
    expect(aventy.site(KEY_B).orders.has(sent.id)).toBe(false);

    await harness.platform.query("update outbound_orders set status = 'pending', next_attempt_at = now()");
    await drainOutbound(deps.platform, destination);
    const { rows: [again] } = await harness.platform.query("select status, last_outcome, aventy_order_id as remote from outbound_orders");
    expect(again).toMatchObject({ status: "sent", last_outcome: "duplicate", remote: sent.remote });
    expect(aventy.site(KEY_A).orders.size).toBe(1);
  });

  it("stop for a channel whose key Aventy revoked, keep its queue, alert, and resume with a new key", async () => {
    await harness.platform.query("delete from outbound_orders");
    const destination = aventyDestination(deps);
    aventy.site(KEY_A).revoked = true;
    const { id } = await productRow("shirt");
    expect((await placeOrder(id, { pricePerUnit: 2500 })).status).toBe(201);
    expect((await placeOrder(id, { pricePerUnit: 2500 })).status).toBe(201);

    await drainOutbound(deps.platform, destination);
    const { rows: waiting } = await harness.platform.query("select status, attempts, last_outcome from outbound_orders order by created_at");
    expect(waiting).toEqual([{ status: "pending", attempts: 0, last_outcome: "unauthorized" }, { status: "pending", attempts: 0, last_outcome: null }]);
    expect((await call("GET", "/api/aventy/key")).json.data).toMatchObject({ status: "revoked" });
    expect((await call("GET", "/api/transmission/alerts")).json.data).toMatchObject({ aventyKey: "revoked" });

    await harness.platform.query("update outbound_orders set next_attempt_at = now()");
    expect(await sendNextOutbound(deps.platform, destination)).toBeNull();
    const before = aventy.calls.length;
    await runAventyHeartbeat(deps);
    expect(aventy.calls.slice(before).some((c) => c.key === KEY_A)).toBe(false);

    const replacement = aventy.site(KEY_A2);
    replacement.products = aventy.site(KEY_A).products;
    expect((await call("PUT", "/api/aventy/key", { key: KEY_A2 })).json.data).toMatchObject({ status: "active", hint: "••••4242" });
    expect((await call("GET", "/api/transmission/alerts")).json.data).toMatchObject({ aventyKey: null });
    await drainOutbound(deps.platform, destination);
    const { rows: delivered } = await harness.platform.query("select status from outbound_orders order by created_at");
    expect(delivered).toEqual([{ status: "sent" }, { status: "sent" }]);
    expect(replacement.orders.size).toBe(2);
  });

  it("wait with an alert when the channel has no key at all", async () => {
    expect((await call("DELETE", "/api/aventy/key")).status).toBe(200);
    expect((await call("GET", "/api/transmission/alerts")).json.data).toMatchObject({ aventyKey: "missing" });
    expect((await call("GET", "/api/transmission/alerts", undefined, { ORDER_DESTINATION: "test" })).json.data).toMatchObject({ aventyKey: null });
  });
});
