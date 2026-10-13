import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type pg from "pg";
import { sql } from "drizzle-orm";
import { createPool } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { createMerchantStore, listMerchantStores } from "./merchant-stores";
import { localPlanPolicy } from "./plan-policy";

let harness: TestDb;
let platform: pg.Pool;
let app: pg.Pool;

beforeAll(async () => {
  harness = await createTestDb();
  platform = createPool(harness.url, "codflow_platform");
  app = createPool(harness.url, "codflow_app");
}, 120_000);

afterAll(async () => {
  await Promise.all([platform?.end(), app?.end()]);
  await harness?.dispose();
});

const create = (merchantId: string, name: string, subdomain: string) =>
  createMerchantStore(platform, { merchantId, name, subdomain, baseDomain: "codflow.test" }, localPlanPolicy());

describe("listMerchantStores", () => {
  it("lists only the merchant's own stores, with their primary hostname", async () => {
    const m1 = await harness.createMerchant();
    const m2 = await harness.createMerchant();
    await harness.createStore("m1-a", ["m1-a.codflow.test"], m1);
    await harness.createStore("m1-b", [], m1);
    await harness.createStore("m2-a", ["m2-a.codflow.test"], m2);

    const stores = await listMerchantStores(platform, m1);

    expect(stores.map((s) => s.id).sort()).toEqual(["m1-a", "m1-b"]);
    expect(stores.find((s) => s.id === "m1-a")?.hostname).toBe("m1-a.codflow.test");
    expect(stores.find((s) => s.id === "m1-b")?.hostname).toBeNull();
  });
});

describe("createMerchantStore", () => {
  it("creates the store on its subdomain, owned by the merchant, with its four legal pages", async () => {
    const merchant = await harness.createMerchant();

    const result = await create(merchant, "Boutique Nour", "nour");

    expect(result).toMatchObject({ ok: true, store: { name: "Boutique Nour", hostname: "nour.codflow.test" } });
    if (!result.ok) return;
    const { rows: store } = await harness.platform.query("select merchant_id from stores where id = $1", [result.store.id]);
    expect(store[0].merchant_id).toBe(merchant);
    const { rows: domain } = await harness.platform.query("select store_id, kind from store_domains where hostname = 'nour.codflow.test'");
    expect(domain[0]).toEqual({ store_id: result.store.id, kind: "subdomain" });
    const { rows: pages } = await harness.platform.query("select kind from store_pages where store_id = $1 order by kind", [result.store.id]);
    expect(pages.map((p) => p.kind)).toEqual(["privacy", "refund", "shipping", "terms"]);
  });

  it("numbers the store's orders after its subdomain", async () => {
    const merchant = await harness.createMerchant();
    const result = await create(merchant, "Boutique Amel", "boutique-amel");
    if (!result.ok) throw new Error("not created");
    const { rows } = await harness.platform.query("select order_prefix from stores where id = $1", [result.store.id]);
    expect(rows[0].order_prefix).toBe("BOUTIQUE");
  });

  it("normalises the subdomain to lower case", async () => {
    const merchant = await harness.createMerchant();
    const result = await create(merchant, "Casing", "  MiXeD-Case ");
    expect(result).toMatchObject({ ok: true, store: { hostname: "mixed-case.codflow.test" } });
  });

  it.each([["a"], ["-start"], ["end-"], ["under_score"], ["dots.in"], ["www"], ["api"], ["app"], ["x".repeat(41)]])(
    "refuses the subdomain %j and creates nothing",
    async (subdomain) => {
      const merchant = await harness.createMerchant();
      const result = await create(merchant, "Bad", subdomain);
      expect(result).toEqual({ ok: false, reason: "invalid_subdomain" });
      expect(await listMerchantStores(platform, merchant)).toEqual([]);
    },
  );

  it("refuses a subdomain another store already uses, and creates nothing", async () => {
    const m1 = await harness.createMerchant();
    const m2 = await harness.createMerchant();
    expect((await create(m1, "First", "taken")).ok).toBe(true);

    const result = await create(m2, "Second", "taken");

    expect(result).toEqual({ ok: false, reason: "subdomain_taken" });
    expect(await listMerchantStores(platform, m2)).toEqual([]);
  });

  it("refuses a store beyond the merchant's plan limit", async () => {
    const merchant = await harness.createMerchant(undefined, 2);
    expect((await create(merchant, "One", "limit-one")).ok).toBe(true);
    expect((await create(merchant, "Two", "limit-two")).ok).toBe(true);

    const third = await create(merchant, "Three", "limit-three");

    expect(third).toEqual({ ok: false, reason: "plan_limit", limit: 2, used: 2 });
    expect(await listMerchantStores(platform, merchant)).toHaveLength(2);
  });

  it("lets two simultaneous creations take only the last free slot", async () => {
    const merchant = await harness.createMerchant(undefined, 1);

    const results = await Promise.all([
      create(merchant, "Race A", "race-a"),
      create(merchant, "Race B", "race-b"),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "plan_limit", limit: 1, used: 1 }]);
    expect(await listMerchantStores(platform, merchant)).toHaveLength(1);
  });

  it("has no limit when the merchant's limit is empty", async () => {
    const merchant = await harness.createMerchant(undefined, null);
    for (const n of [1, 2, 3]) expect((await create(merchant, `S${n}`, `nolimit-${n}`)).ok).toBe(true);
  });
});

describe("merchant isolation for request code", () => {
  it("lets a request see only its own merchant's users", async () => {
    const m1 = await harness.createMerchant();
    const m2 = await harness.createMerchant();
    const now = new Date().toISOString();
    for (const [id, merchant] of [["u1", m1], ["u2", m2]]) {
      await harness.platform.query(
        "insert into users (id, name, email, merchant_id, created_at, updated_at) values ($1, $1, $1 || '@x.test', $2, $3, $3)",
        [id, merchant, now],
      );
    }
    const client = await app.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.merchant_id', $1, true)", [m1]);
      const { rows } = await client.query("select id from users where id in ('u1', 'u2')");
      const moved = await client.query("update users set name = 'stolen' where id = 'u2'");
      await client.query("commit");
      expect(rows.map((r) => r.id)).toEqual(["u1"]);
      expect(moved.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it("never lets request code move a store to another merchant", async () => {
    const m2 = await harness.createMerchant();
    const db = await harness.connect();
    await expect(db.execute(sql`update stores set merchant_id = ${m2} where id = 'test-store'`)).rejects.toThrow();
  });
});
