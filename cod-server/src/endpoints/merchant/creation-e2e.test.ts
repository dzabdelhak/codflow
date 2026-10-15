/**
 * Creating a sales channel through POST /api/merchant/stores (ticket 07), on
 * PostgreSQL through the real auth and dashboard scope: one call saves the
 * whole configuration, and a creation key makes retries and resumed attempts
 * land on the same channel.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, withStore, type Database } from "@/db/scope";
import { getStoreConfig } from "../../../../cod-shared/queries/store";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import merchantRoutes from "./routes";

let harness: TestDb;
let database: Database;
let merchant: string;

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.route("/api/merchant", merchantRoutes);

const env = () => ({ DATABASE: database, STORE_BASE_DOMAIN: "codflow.test" }) as never;
const create = (body: unknown) =>
  app.request(
    "/api/merchant/stores",
    { method: "POST", headers: { "X-API-Key": "key-creator", "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env(),
  );

beforeAll(async () => {
  harness = await createTestDb();
  merchant = await harness.createMerchant("m-creator");
  await harness.createStore("creator-home", [], merchant);
  const now = new Date().toISOString();
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-creator', 'Creator', 'creator@x.test', 'admin', 'key-creator', $1, $2, $2)`,
    [merchant, now],
  );
  await harness.platform.query(
    `insert into products (id, merchant_id, name, handle, price, created_at, updated_at) values
       ('cat-1', $1, 'One', 'one', 1000, '', ''), ('cat-2', $1, 'Two', 'two', 2000, '', '')`,
    [merchant],
  );
  await harness.platform.query(
    `insert into shipping_profiles (id, merchant_id, name, is_default, created_at, updated_at)
     values ('creator-express', $1, 'Express', false, '', '')`,
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

async function storesWithKey(key: string) {
  return (await harness.platform.query("select id from stores where creation_key = $1", [key])).rows;
}

describe("creating a store channel", () => {
  it("saves its products, delivery modes, default profile and template in one call, as a draft on its subdomain", async () => {
    const res = await create({
      type: "store",
      name: "Wizard Shop",
      subdomain: "wizard-shop",
      creationKey: "key-full-creation",
      productIds: ["cat-2", "cat-1"],
      deliveryModes: { home: true, stopDesk: false },
      defaultShippingProfileId: "creator-express",
      templateId: "theme01",
    });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string; status: string; hostname: string } };
    expect(data).toMatchObject({ status: "draft", hostname: "wizard-shop.codflow.test" });

    const { rows: [store] } = await harness.platform.query(
      "select theme_id, checkout_form_json, default_shipping_profile_id from stores where id = $1",
      [data.id],
    );
    expect(store.theme_id).toBe("theme01");
    expect(store.default_shipping_profile_id).toBe("creator-express");
    expect(JSON.parse(store.checkout_form_json).deliveryOptions).toEqual({ home: true, stopDesk: false });
    const selection = await harness.platform.query(
      "select product_id, published from channel_products where store_id = $1 order by position",
      [data.id],
    );
    expect(selection.rows).toEqual([
      { product_id: "cat-2", published: true },
      { product_id: "cat-1", published: true },
    ]);
    const pages = await harness.platform.query("select count(*)::int as n from store_pages where store_id = $1", [data.id]);
    expect(pages.rows[0].n).toBe(4);
  });

  it("returns the same channel when the same creation is submitted twice", async () => {
    const body = { name: "Twice", subdomain: "twice-shop", creationKey: "key-double-click" };
    const first = await create(body);
    const second = await create(body);
    expect([first.status, second.status]).toEqual([201, 200]);
    expect((await second.clone().json()) as { created: boolean }).toMatchObject({ created: false });
    const ids = await Promise.all([first, second].map(async (r) => ((await r.json()) as { data: { id: string } }).data.id));
    expect(ids[0]).toBe(ids[1]);
    expect(await storesWithKey("key-double-click")).toHaveLength(1);
  });

  it("creates one channel when retries race each other", async () => {
    const body = { name: "Race", subdomain: "race-shop", creationKey: "key-network-retry" };
    const results = await Promise.all([create(body), create(body), create(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(await storesWithKey("key-network-retry")).toHaveLength(1);
  });

  it("creates nothing when a step fails, and the resumed attempt with the same key succeeds", async () => {
    const failed = await create({ name: "Resume", subdomain: "wizard-shop", creationKey: "key-resume" });
    expect(failed.status).toBe(409);
    expect(await storesWithKey("key-resume")).toHaveLength(0);

    const unknownProduct = await create({ name: "Resume", subdomain: "resume-shop", creationKey: "key-resume", productIds: ["nope"] });
    expect(unknownProduct.status).toBe(400);
    expect(await storesWithKey("key-resume")).toHaveLength(0);

    const resumed = await create({ name: "Resume", subdomain: "resume-shop", creationKey: "key-resume", productIds: ["cat-1"] });
    expect(resumed.status).toBe(201);
    expect(await storesWithKey("key-resume")).toHaveLength(1);
  });

  it("starts a store from a ready-made template with that template's colours, font and sections", async () => {
    const res = await create({ name: "Mode", subdomain: "mode-shop", templateId: "boutique", productIds: ["cat-1"] });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string } };
    const { rows: [store] } = await harness.platform.query(
      "select theme_id, primary_color, accent_color, bg_color, font_family, cart_enabled from stores where id = $1",
      [data.id],
    );
    expect(store).toEqual({
      theme_id: "boutique", primary_color: "#1f2937", accent_color: "#c9a227", bg_color: "#faf7f2", font_family: "Tajawal, sans-serif", cart_enabled: true,
    });
    const config = await withStore(database.app, data.id, (db) => getStoreConfig(db, data.id), merchant);
    expect(config?.design.sections.map((s) => s.type).slice(0, 2)).toEqual(["hero", "new_arrivals"]);
    expect(config?.design.sections.find((s) => s.type === "hero")?.settings.heroTitle).toBeTruthy();
  });

  it("adds the merchant's own domain as pending, and refuses an invalid or taken one without creating the channel", async () => {
    const res = await create({ name: "Own", subdomain: "own-domain", customDomain: "https://WWW.Maison-Own.dz/" });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string } };
    const { rows } = await harness.platform.query(
      "select hostname, kind, status, is_primary from store_domains where store_id = $1 order by kind",
      [data.id],
    );
    expect(rows).toEqual([
      { hostname: "www.maison-own.dz", kind: "custom", status: "pending", is_primary: false },
      { hostname: "own-domain.codflow.test", kind: "subdomain", status: "verified", is_primary: true },
    ]);

    expect((await create({ name: "Bad", subdomain: "bad-domain", customDomain: "shop.codflow.test" })).status).toBe(400);
    const taken = await create({ name: "Taken", subdomain: "taken-domain", customDomain: "www.maison-own.dz" });
    expect(taken.status).toBe(409);
    expect((await harness.platform.query("select 1 from store_domains where hostname = 'taken-domain.codflow.test'")).rowCount).toBe(0);
  });

  it("refuses another account's shipping profile, an unknown template and a type not available yet", async () => {
    await harness.platform.query(
      "insert into merchants (id, name, created_at) values ('m-other-creator', 'Other', '') on conflict do nothing",
    );
    await harness.platform.query(
      `insert into shipping_profiles (id, merchant_id, name, is_default, created_at, updated_at)
       values ('other-profile', 'm-other-creator', 'Other', true, '', '')`,
    );
    expect((await create({ name: "X", subdomain: "x-profile", defaultShippingProfileId: "other-profile" })).status).toBe(400);
    expect((await create({ name: "X", subdomain: "x-template", templateId: "theme99" })).status).toBe(400);
    expect((await create({ type: "landing", name: "X", subdomain: "x-landing" })).status).toBe(400);
    expect((await create({ name: "X", subdomain: "x-modes", deliveryModes: { home: false, stopDesk: false } })).status).toBe(400);
  });
});
