import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, TEST_MERCHANT_ID, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import routes from "./routes";

let harness: TestDb;
let database: Database;
let sibling: string;

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.route("/api/order-protection", routes);

async function call(method: string, path: string, body?: unknown, storeId = harness.storeId) {
  const res = await app.request(
    `/api/order-protection${path}`,
    {
      method,
      headers: { "X-API-Key": "key-protection", "Content-Type": "application/json", "X-Store-Id": storeId },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { DATABASE: database } as never,
  );
  return { status: res.status, json: (await res.json()) as { data: Array<Record<string, unknown>>; code?: string } };
}

beforeAll(async () => {
  harness = await createTestDb();
  sibling = await harness.createStore("protection-sibling", [], TEST_MERCHANT_ID);
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-protection', 'Protection', 'protection@x.test', 'admin', 'key-protection', $1, now(), now())`,
    [TEST_MERCHANT_ID],
  );
  await harness.platform.query(
    `insert into blocked_order_attempts (store_id, id, reason, order_number, phone, customer_name, details)
     values ($1, 'a-1', 'phone_window', 'NOUR-00042', '0550000001', 'Amina', '{"lines":[],"total":null}'),
            ($2, 'a-2', 'ip_ceiling', 'SIB-00007', '0550000002', 'Karim', '{"lines":[],"total":null}')`,
    [harness.storeId, sibling],
  );
  const appPool = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("order protection in the dashboard", () => {
  it("lists only the active channel's blocked attempts", async () => {
    expect((await call("GET", "/attempts")).json.data.map((a) => a.orderNumber)).toEqual(["NOUR-00042"]);
    expect((await call("GET", "/attempts", undefined, sibling)).json.data.map((a) => a.orderNumber)).toEqual(["SIB-00007"]);
  });

  it("keeps one blocklist for the account, whichever channel edits it", async () => {
    const added = await call("POST", "/blocked-phones", { phone: "+213 550 12 34 56", note: "fake orders" });
    expect(added.status).toBe(201);
    expect(added.json.data).toMatchObject([{ phone: "0550123456", note: "fake orders", createdBy: "Protection" }]);
    expect((await call("POST", "/blocked-phones", { phone: "0550123456" }, sibling)).json.data).toHaveLength(1);

    const fromSibling = await call("GET", "/blocked-phones", undefined, sibling);
    expect(fromSibling.json.data.map((p) => p.phone)).toEqual(["0550123456"]);

    const removed = await call("DELETE", `/blocked-phones/${fromSibling.json.data[0].id}`, undefined, sibling);
    expect(removed.json.data).toEqual([]);
    const { rows } = await harness.platform.query("select action from activity_logs where entity_type = 'phone' order by created_at");
    expect(rows.map((r) => r.action)).toEqual(["phone.blocked", "phone.unblocked"]);
  });

  it("refuses something that is not an Algerian mobile", async () => {
    const res = await call("POST", "/blocked-phones", { phone: "12345" });
    expect([res.status, res.json.code]).toEqual([400, "INVALID_PHONE_FORMAT"]);
  });
});
