/**
 * Team members across merchants: an email is one sign-in identity for the
 * whole platform, even though each merchant only sees its own users.
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
import usersRoutes from "./routes";

let harness: TestDb;
let database: Database;

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.route("/api/users", usersRoutes);

const addMember = (key: string, email: string) =>
  app.request(
    "/api/users",
    {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: "New Member", role: "staff", scopes: [] }),
    },
    { DATABASE: database } as never,
  );

beforeAll(async () => {
  harness = await createTestDb();
  const a = await harness.createMerchant("m-a");
  const b = await harness.createMerchant("m-b");
  await harness.createStore("store-a", [], a);
  await harness.createStore("store-b", [], b);
  const now = new Date().toISOString();
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at) values
       ('admin-a', 'Admin A', 'admin-a@x.test', 'admin', 'key-a', 'm-a', $1, $1),
       ('admin-b', 'Admin B', 'admin-b@x.test', 'admin', 'key-b', 'm-b', $1, $1)`,
    [now],
  );
  const app_ = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: app_, platform, close: async () => void (await Promise.all([app_.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("adding a team member", () => {
  it("adds the member to the admin's own merchant", async () => {
    const res = await addMember("key-b", "fresh@x.test");
    expect(res.status).toBe(201);
    const { rows } = await harness.platform.query("select merchant_id from users where email = 'fresh@x.test'");
    expect(rows[0].merchant_id).toBe("m-b");
  });

  it("answers 409 DUPLICATE_EMAIL when another merchant already uses the address", async () => {
    const res = await addMember("key-b", "admin-a@x.test");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "DUPLICATE_EMAIL" });
    const { rows } = await harness.platform.query("select merchant_id from users where email = 'admin-a@x.test'");
    expect(rows.map((r) => r.merchant_id)).toEqual(["m-a"]);
  });
});
