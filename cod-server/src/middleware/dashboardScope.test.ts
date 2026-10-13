/**
 * Dashboard request scope: the user's merchant comes from their identity, the
 * active store from X-Store-Id — accepted only when the merchant owns it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppContext } from "@/types";
import { products } from "@/db/schema";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "./auth";
import { dashboardScope } from "./dashboardScope";

let harness: TestDb;
let database: Database;
let mine: string;
let other: string;

const app = new Hono<AppContext>();
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.get("/api/products", async (c) => {
  const rows = await c.get("db").select({ id: products.id }).from(products);
  return c.json({ storeId: c.get("storeId") ?? null, ids: rows.map((r) => r.id).sort() });
});

const call = (headers: Record<string, string>) =>
  app.request("/api/products", { headers }, { DATABASE: database } as never);

beforeAll(async () => {
  harness = await createTestDb();
  mine = await harness.createMerchant();
  other = await harness.createMerchant();
  await harness.createStore("mine-1", [], mine);
  await harness.createStore("mine-2", [], mine);
  await harness.createStore("other-1", [], other);
  const now = new Date().toISOString();
  for (const [id, store] of [["p-mine-1", "mine-1"], ["p-mine-2", "mine-2"], ["p-other-1", "other-1"]]) {
    await harness.platform.query(
      "insert into products (id, store_id, name, handle, price, created_at, updated_at) values ($1, $2, $1, $1, 100, '', '')",
      [id, store],
    );
  }
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-mine', 'Mine', 'mine@x.test', 'admin', 'key-mine', $1, $2, $2),
            ('u-other', 'Other', 'other@x.test', 'admin', 'key-other', $3, $2, $2)`,
    [mine, now, other],
  );
  const app_ = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: app_, platform, close: async () => void (await Promise.all([app_.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("dashboard store selection", () => {
  it("works in the store named by X-Store-Id when the user's merchant owns it", async () => {
    const res = await call({ "X-API-Key": "key-mine", "X-Store-Id": "mine-2" });
    expect(await res.json()).toEqual({ storeId: "mine-2", ids: ["p-mine-2"] });
  });

  it("refuses a store of another merchant, whatever the header says", async () => {
    const res = await call({ "X-API-Key": "key-mine", "X-Store-Id": "other-1" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "STORE_NOT_OWNED" });
  });

  it("refuses an unknown store id", async () => {
    const res = await call({ "X-API-Key": "key-mine", "X-Store-Id": "nope" });
    expect(res.status).toBe(403);
  });

  it("falls back to the merchant's first store when no store is named", async () => {
    const res = await call({ "X-API-Key": "key-mine" });
    expect(await res.json()).toEqual({ storeId: "mine-1", ids: ["p-mine-1"] });
  });

  it("gives another merchant's user their own stores only", async () => {
    const res = await call({ "X-API-Key": "key-other" });
    expect(await res.json()).toEqual({ storeId: "other-1", ids: ["p-other-1"] });
  });

  it("still requires authentication", async () => {
    const res = await call({ "X-Store-Id": "mine-1" });
    expect(res.status).toBe(401);
  });
});
