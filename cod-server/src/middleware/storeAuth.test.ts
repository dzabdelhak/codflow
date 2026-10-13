/**
 * Storefront request scope on PostgreSQL: the channel comes from the
 * visitor's hostname (trusted only with the storefront key), and every query
 * of the request runs inside one transaction confined to that channel by RLS.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppContext } from "@/types";
import { products } from "@/db/schema";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { storeAuthMiddleware } from "./storeAuth";

const KEY = "storefront-test-key";
let harness: TestDb;
let database: Database;

const app = new Hono<AppContext>();
app.use("/store/*", storeAuthMiddleware);
app.get("/store/products", async (c) => {
  const rows = await c.get("db").select({ id: products.id }).from(products);
  return c.json({ storeId: c.get("storeId"), ids: rows.map((r) => r.id).sort() });
});
app.post("/store/products/:id/then-fail", async (c) => {
  await c.get("db").execute(sql`update products set name = 'changed' where id = ${c.req.param("id")}`);
  throw new Error("boom after a write");
});
app.post("/store/products/:id/rename", async (c) => {
  await c.get("db").execute(sql`update products set name = 'renamed' where id = ${c.req.param("id")}`);
  return c.json({ ok: true });
});
app.onError((_err, c) => c.json({ error: "failed" }, 500));

function call(path: string, headers: Record<string, string>, method = "GET") {
  return app.request(path, { method, headers }, { DATABASE: database, STOREFRONT_SERVICE_KEY: KEY } as never);
}
const asStorefront = (host: string) => ({ "X-Storefront-Key": KEY, "X-Channel-Host": host });

async function seedProduct(storeId: string, id: string) {
  await harness.platform.query(
    `insert into products (id, store_id, name, handle, price, created_at, updated_at)
     values ($1, $2, $1, $1, 1000, '', '')`,
    [id, storeId],
  );
}

beforeAll(async () => {
  harness = await createTestDb();
  await harness.createStore("shop-a", ["shop-a.localhost", "boutique-a.dz"]);
  await harness.createStore("shop-b", ["shop-b.localhost"]);
  await seedProduct("shop-a", "a-1");
  await seedProduct("shop-a", "a-2");
  await seedProduct("shop-b", "b-1");
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

describe("request transaction", () => {
  it("commits the writes of a request that succeeds", async () => {
    const res = await call("/store/products/a-1/rename", asStorefront("shop-a.localhost"), "POST");
    expect(res.status).toBe(200);
    const { rows } = await harness.platform.query("select name from products where id = 'a-1'");
    expect(rows[0].name).toBe("renamed");
  });

  it("rolls back every write of a request that fails", async () => {
    const res = await call("/store/products/a-2/then-fail", asStorefront("shop-a.localhost"), "POST");
    expect(res.status).toBe(500);
    const { rows } = await harness.platform.query("select name from products where id = 'a-2'");
    expect(rows[0].name).toBe("a-2");
  });

  it("cannot touch another channel's rows from a channel's request", async () => {
    await call("/store/products/b-1/rename", asStorefront("shop-a.localhost"), "POST");
    const { rows } = await harness.platform.query("select name from products where id = 'b-1'");
    expect(rows[0].name).toBe("b-1");
  });
});
