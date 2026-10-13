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
