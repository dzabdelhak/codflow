/**
 * Storefront request scope on PostgreSQL: the channel comes from the
 * visitor's hostname (trusted only with the storefront key), and every query
 * of the request runs inside one transaction confined to that channel by RLS.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppContext } from "@/types";
import { channelProducts, users } from "@/db/schema";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { storeAuthMiddleware } from "./storeAuth";

const KEY = "storefront-test-key";
let harness: TestDb;
let database: Database;

const app = new Hono<AppContext>();
app.use("/store/*", storeAuthMiddleware);
app.get("/store/products", async (c) => {
  const rows = await c.get("db").select({ id: channelProducts.productId }).from(channelProducts);
  return c.json({ storeId: c.get("storeId"), ids: rows.map((r) => r.id).sort() });
});
app.post("/store/products/:id/then-fail", async (c) => {
  await c.get("db").execute(sql`update channel_products set featured = true where product_id = ${c.req.param("id")}`);
  throw new Error("boom after a write");
});
app.post("/store/products/:id/rename", async (c) => {
  await c.get("db").execute(sql`update channel_products set featured = true where product_id = ${c.req.param("id")}`);
  return c.json({ ok: true });
});
app.get("/store/user-ids", async (c) => {
  const rows = await c.get("db").select({ id: users.id }).from(users);
  return c.json(rows.map((r) => r.id).sort());
});
app.onError((_err, c) => c.json({ error: "failed" }, 500));

function call(path: string, headers: Record<string, string>, method = "GET") {
  return app.request(path, { method, headers }, { DATABASE: database, STOREFRONT_SERVICE_KEY: KEY } as never);
}
const asStorefront = (host: string) => ({ "X-Storefront-Key": KEY, "X-Channel-Host": host });

async function seedProduct(storeId: string, id: string) {
  await harness.platform.query(
    `insert into products (id, merchant_id, name, handle, price, created_at, updated_at)
     values ($1, (select merchant_id from stores where id = $2), $1, $1, 1000, '', '')`,
    [id, storeId],
  );
  await harness.platform.query(
    "insert into channel_products (store_id, product_id, created_at, updated_at) values ($1, $2, '', '')",
    [storeId, id],
  );
}

beforeAll(async () => {
  harness = await createTestDb();
  await harness.createStore("shop-a", ["shop-a.localhost", "boutique-a.dz"]);
  await harness.createStore("shop-b", ["shop-b.localhost"]);
  await seedProduct("shop-a", "a-1");
  await seedProduct("shop-a", "a-2");
  await seedProduct("shop-b", "b-1");
  const other = await harness.createMerchant("other-merchant");
  await harness.createStore("shop-c", ["shop-c.localhost"], other);
  await harness.platform.query(
    `insert into users (id, name, email, merchant_id, created_at, updated_at) values
       ('u-test', 'T', 't@x.test', 'test-merchant', now(), now()),
       ('u-other', 'O', 'o@x.test', 'other-merchant', now(), now())`,
  );
  const app = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app, platform, close: async () => void (await Promise.all([app.end(), platform.end()])) };
});

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("storefront channel resolution", () => {
  it("refuses a request without the storefront key, whatever host it names", async () => {
    const res = await call("/store/products", { "X-Channel-Host": "shop-a.localhost" });
    expect(res.status).toBe(401);
  });

  it("refuses a wrong storefront key", async () => {
    const res = await call("/store/products", { "X-Storefront-Key": "nope", "X-Channel-Host": "shop-a.localhost" });
    expect(res.status).toBe(401);
  });

  it("answers 404 for a hostname no channel uses", async () => {
    const res = await call("/store/products", asStorefront("unknown.localhost"));
    expect(res.status).toBe(404);
  });

  it("serves each channel only its own rows, by subdomain or own domain, port ignored", async () => {
    const a = await (await call("/store/products", asStorefront("shop-a.localhost:8090"))).json();
    const aOwnDomain = await (await call("/store/products", asStorefront("BOUTIQUE-A.dz"))).json();
    const b = await (await call("/store/products", asStorefront("shop-b.localhost"))).json();
    expect(a).toEqual({ storeId: "shop-a", ids: ["a-1", "a-2"] });
    expect(aOwnDomain).toEqual(a);
    expect(b).toEqual({ storeId: "shop-b", ids: ["b-1"] });
  });
});

describe("merchant of the channel", () => {
  it("lets a storefront request see its own merchant's users, and only those", async () => {
    expect(await (await call("/store/user-ids", asStorefront("shop-a.localhost"))).json()).toEqual(["u-test"]);
    expect(await (await call("/store/user-ids", asStorefront("shop-c.localhost"))).json()).toEqual(["u-other"]);
  });
});

describe("request transaction", () => {
  it("commits the writes of a request that succeeds", async () => {
    const res = await call("/store/products/a-1/rename", asStorefront("shop-a.localhost"), "POST");
    expect(res.status).toBe(200);
    const { rows } = await harness.platform.query("select featured from channel_products where product_id = 'a-1'");
    expect(rows[0].featured).toBe(true);
  });

  it("rolls back every write of a request that fails", async () => {
    const res = await call("/store/products/a-2/then-fail", asStorefront("shop-a.localhost"), "POST");
    expect(res.status).toBe(500);
    const { rows } = await harness.platform.query("select featured from channel_products where product_id = 'a-2'");
    expect(rows[0].featured).toBe(false);
  });

  it("cannot touch another channel's rows from a channel's request", async () => {
    await call("/store/products/b-1/rename", asStorefront("shop-a.localhost"), "POST");
    const { rows } = await harness.platform.query("select featured from channel_products where product_id = 'b-1'");
    expect(rows[0].featured).toBe(false);
  });
});

describe("channel status", () => {
  async function setStatus(storeId: string, status: string) {
    await harness.platform.query("update stores set status = $2 where id = $1", [storeId, status]);
  }

  it("answers only for a published channel; a channel not yet published is unknown", async () => {
    for (const status of ["draft", "configuring", "ready"]) {
      await setStatus("shop-b", status);
      expect((await call("/store/products", asStorefront("shop-b.localhost"))).status).toBe(404);
    }
    await setStatus("shop-b", "published");
    expect((await call("/store/products", asStorefront("shop-b.localhost"))).status).toBe(200);
  });

  it("takes a suspended channel offline with an unavailable answer, keeps its data and restores it on reactivation", async () => {
    await setStatus("shop-b", "suspended");
    const res = await call("/store/products", asStorefront("shop-b.localhost"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "CHANNEL_UNAVAILABLE" });

    await setStatus("shop-b", "published");
    expect(await (await call("/store/products", asStorefront("shop-b.localhost"))).json()).toMatchObject({ ids: ["b-1"] });
  });

  it("removes an archived channel from the public web", async () => {
    await setStatus("shop-b", "archived");
    expect((await call("/store/products", asStorefront("shop-b.localhost"))).status).toBe(404);
    await setStatus("shop-b", "published");
  });
});
