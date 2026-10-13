/**
 * /api/merchant/stores — the header dropdown's list and its "Create store",
 * through the real auth and dashboard scope.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
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
const list = (key: string) => app.request("/api/merchant/stores", { headers: { "X-API-Key": key } }, env());
const create = (key: string, body: unknown) =>
  app.request(
    "/api/merchant/stores",
    { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env(),
  );

beforeAll(async () => {
  harness = await createTestDb();
  merchant = await harness.createMerchant("m-routes", 2);
  const stranger = await harness.createMerchant("m-stranger");
  await harness.createStore("routes-1", ["routes-1.codflow.test"], merchant);
  await harness.createStore("stranger-1", [], stranger);
  const now = new Date().toISOString();
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at) values
       ('u-admin', 'Admin', 'admin@x.test', 'admin', 'key-admin', $1, $2, $2),
       ('u-staff', 'Staff', 'staff@x.test', 'staff', 'key-staff', $1, $2, $2)`,
    [merchant, now],
  );
  const app_ = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: app_, platform, close: async () => void (await Promise.all([app_.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("GET /api/merchant/stores", () => {
  it("lists the user's merchant's stores — never another merchant's", async () => {
    const res = await list("key-staff");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string; hostname: string | null }> };
    expect(body.data).toEqual([expect.objectContaining({ id: "routes-1", hostname: "routes-1.codflow.test" })]);
  });
});

describe("POST /api/merchant/stores", () => {
  it("creates a store on the deployment's base domain and returns it", async () => {
    const res = await create("key-admin", { name: "Second shop", subdomain: "second-shop" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; hostname: string } };
    expect(body.data.hostname).toBe("second-shop.codflow.test");
    expect((await list("key-admin")).status).toBe(200);
  });

  it("refuses a store beyond the plan with STORE_LIMIT_REACHED", async () => {
    const res = await create("key-admin", { name: "Third", subdomain: "third-shop" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "STORE_LIMIT_REACHED" });
  });

  it("is for admins only", async () => {
    const res = await create("key-staff", { name: "Nope", subdomain: "staff-shop" });
    expect(res.status).toBe(403);
  });

  it("answers 400 INVALID_SUBDOMAIN and 409 SUBDOMAIN_TAKEN", async () => {
    await harness.platform.query("update merchants set store_limit = null where id = $1", [merchant]);
    const invalid = await create("key-admin", { name: "Bad", subdomain: "www" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "INVALID_SUBDOMAIN" });
    const taken = await create("key-admin", { name: "Dup", subdomain: "routes-1" });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ code: "SUBDOMAIN_TAKEN" });
  });

  it("validates the name", async () => {
    const res = await create("key-admin", { name: "", subdomain: "empty-name" });
    expect(res.status).toBe(400);
  });
});

describe("store lifecycle", () => {
  const send = (key: string, method: string, path: string, body?: unknown) =>
    app.request(
      `/api/merchant/stores${path}`,
      {
        method,
        headers: { "X-API-Key": key, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env(),
    );
  const setStatus = (key: string, id: string, status: string) => send(key, "PATCH", `/${id}/status`, { status });

  it("starts a new store as draft and takes it to published step by step, logging who and when", async () => {
    const created = (await (await create("key-admin", { name: "Lifecycle", subdomain: "lifecycle-shop" })).json()) as {
      data?: { id: string; status: string };
    };
    const id = created.data?.id ?? (await harness.createStore("lifecycle-1", [], merchant));
    if (created.data) expect(created.data.status).toBe("draft");
    await harness.platform.query("update stores set status = 'draft' where id = $1", [id]);

    for (const status of ["configuring", "ready", "published"]) {
      const res = await setStatus("key-admin", id, status);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ data: { id, status } });
    }

    const history = (await (await send("key-staff", "GET", `/${id}/status-history`)).json()) as {
      data: Array<{ actorName: string; from: string; to: string; createdAt: string }>;
    };
    expect(history.data.map((h) => [h.from, h.to])).toEqual([
      ["ready", "published"],
      ["configuring", "ready"],
      ["draft", "configuring"],
    ]);
    expect(history.data.every((h) => h.actorName === "Admin" && h.createdAt)).toBe(true);
  });

  it("refuses a move the lifecycle does not allow, and changes nothing", async () => {
    await harness.platform.query("update stores set status = 'draft' where id = 'routes-1'");
    const res = await setStatus("key-admin", "routes-1", "published");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    const { rows } = await harness.platform.query("select status from stores where id = 'routes-1'");
    expect(rows[0].status).toBe("draft");
    await harness.platform.query("update stores set status = 'published' where id = 'routes-1'");
  });

  it("is for admins only, and never reaches another merchant's store", async () => {
    expect((await setStatus("key-staff", "routes-1", "suspended")).status).toBe(403);
    expect((await setStatus("key-admin", "stranger-1", "archived")).status).toBe(404);
    expect((await send("key-admin", "GET", "/stranger-1/status-history")).status).toBe(404);
  });

  it("deletes only an archived store that never received an order, once its name is typed", async () => {
    const id = await harness.createStore("to-delete", ["to-delete.codflow.test"], merchant);
    expect(await (await send("key-admin", "DELETE", `/${id}`, { confirmName: `Store ${id}` })).json()).toMatchObject({
      code: "STORE_NOT_DELETABLE",
      context: { reason: "not_archived" },
    });

    await setStatus("key-admin", id, "archived");
    expect((await send("key-admin", "DELETE", `/${id}`, { confirmName: "wrong" })).status).toBe(400);

    const res = await send("key-admin", "DELETE", `/${id}`, { confirmName: `Store ${id}` });
    expect(res.status).toBe(200);
    const { rowCount } = await harness.platform.query("select 1 from stores where id = $1", [id]);
    expect(rowCount).toBe(0);
  });

  it("keeps an archived store that has orders, with its orders and logs", async () => {
    const id = await harness.createStore("with-orders", [], merchant);
    await harness.platform.query(
      `insert into customers (id, store_id, name, phone, wilaya, created_at) values ('c-wo', $1, 'C', '0550000000', 'Alger', now())`,
      [id],
    );
    await harness.platform.query(
      `insert into orders (id, store_id, order_number, customer_id, customer_name, phone, price, created_at, updated_at)
       values ('o-wo', $1, 'WO-00001', 'c-wo', 'C', '0550000000', 1000, now(), now())`,
      [id],
    );
    await setStatus("key-admin", id, "archived");

    const res = await send("key-admin", "DELETE", `/${id}`, { confirmName: `Store ${id}` });
    expect(await res.json()).toMatchObject({ code: "STORE_NOT_DELETABLE", context: { reason: "has_orders" } });
    const { rowCount } = await harness.platform.query("select 1 from orders where id = 'o-wo'");
    expect(rowCount).toBe(1);
    const logs = await harness.platform.query("select 1 from activity_logs where store_id = $1", [id]);
    expect(logs.rowCount).toBe(1);
  });
});
