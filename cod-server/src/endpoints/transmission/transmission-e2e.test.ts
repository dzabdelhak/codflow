import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, TEST_MERCHANT_ID, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import * as schema from "@/db/schema";
import routes from "./routes";
import { ulid } from "../../../../cod-shared/lib/ulid";
import { createOrder } from "../../../../cod-shared/queries/orders";

let harness: TestDb;
let database: Database;
let other: string;
let seq = 0;

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.route("/api/transmission", routes);

type Entry = { sendId: string; orderNumber: string; status: string; attempts: number; outcomeDetail: unknown };
type State = {
  destination: string;
  connection: { state: string; lastOutcome: string | null };
  lastSuccessAt: string | null;
  counts: { waiting: number; sent: number; rejected: number; stale: number };
  waiting: Entry[];
  rejected: Entry[];
  recentErrors: Entry[];
};

async function call(method: string, path: string, storeId = harness.storeId) {
  const res = await app.request(
    `/api/transmission${path}`,
    { method, headers: { "X-API-Key": "key-transmission", "X-Store-Id": storeId } },
    { DATABASE: database } as never,
  );
  const text = await res.text();
  if (!text.startsWith("{")) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, json: JSON.parse(text) as { data: State; code?: string } };
}

async function entry(storeId: string, values: Record<string, unknown>) {
  const n = ++seq;
  const db = await harness.connect(storeId);
  const now = new Date().toISOString();
  const phone = `0550${String(n).padStart(6, "0")}`;
  await db.insert(schema.customers).values({ id: `tc-${n}`, name: "Amina", phone, wilaya: "Alger", createdAt: now });
  await db.insert(schema.orders).values({
    id: `to-${n}`, orderNumber: `TR-${n}`, customerId: `tc-${n}`, customerName: "Amina", phone,
    price: 1000, deliveryFee: 0, createdAt: now, updatedAt: now,
  });
  const id = ulid();
  await db.insert(schema.outboundOrders).values({
    id, orderId: `to-${n}`, payload: { reference: `TR-${n}`, customer: { name: "Amina", phone: "0550000001" }, lines: [{ sku: "X", quantity: 1 }] },
    ...values,
  });
  return { sendId: id, orderId: `to-${n}` };
}

beforeAll(async () => {
  harness = await createTestDb();
  other = await harness.createStore("transmission-other", [], TEST_MERCHANT_ID);
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-transmission', 'Ops', 'ops@x.test', 'admin', 'key-transmission', $1, now(), now())`,
    [TEST_MERCHANT_ID],
  );
  const appPool = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("the transmission diagnostics", () => {
  it("shows the channel's waiting, sent and rejected orders, the last success, the errors and the stale ones", async () => {
    await entry(harness.storeId, { status: "sent", sentAt: new Date(Date.now() - 60_000), lastAttemptAt: new Date(Date.now() - 60_000), lastOutcome: "accepted", aventyOrderId: "AV-1" });
    await entry(harness.storeId, { createdAt: new Date(Date.now() - 25 * 3600_000), queuedAt: new Date(Date.now() - 25 * 3600_000), attempts: 7, lastAttemptAt: new Date(), lastOutcome: "retry", lastError: "busy" });
    await entry(harness.storeId, { status: "rejected", lastAttemptAt: new Date(Date.now() - 1000), lastOutcome: "rejected", outcomeDetail: { fields: ["customer.phone"] }, lastError: "invalid phone" });
    await entry(other, { status: "rejected", lastOutcome: "rejected" });

    const { json } = await call("GET", "");
    expect(json.data).toMatchObject({
      destination: "test",
      connection: { state: "failing", lastOutcome: "retry" },
      counts: { waiting: 1, sent: 1, rejected: 1, stale: 1 },
    });
    expect(json.data.lastSuccessAt).toBeTruthy();
    expect(json.data.waiting).toEqual([expect.objectContaining({ attempts: 7, status: "pending" })]);
    expect(json.data.rejected).toEqual([expect.objectContaining({ outcomeDetail: { fields: ["customer.phone"] } })]);
    expect(json.data.recentErrors.map((e) => e.status)).toEqual(["pending", "rejected"]);
    const alerts = (await call("GET", "/alerts")).json.data as unknown as { stale: number; rejected: number };
    expect(alerts).toEqual({ stale: 1, rejected: 1 });
  });

  it("resends a rejected order with the customer and delivery as corrected, under the same send id, restarting its 24-hour clock", async () => {
    const { sendId, orderId } = await entry(harness.storeId, {
      status: "rejected", attempts: 1, lastOutcome: "rejected", lastError: "invalid phone",
      createdAt: new Date(Date.now() - 48 * 3600_000), queuedAt: new Date(Date.now() - 48 * 3600_000),
    });
    await harness.platform.query(
      `update orders set phone = '0661234567', address = 'Rue corrigée', wilaya_id = 16, commune_id = 'c-16-001',
              delivery_type = 'home', delivery_fee = 400, delivery_fee_to_confirm = false, delivery_grid_version = 3 where id = $1`,
      [orderId],
    );

    const res = await call("POST", `/${sendId}/resend`);
    expect(res.status).toBe(200);
    const { rows: [row] } = await harness.platform.query(
      "select status, attempts, last_error, payload, queued_at > now() - interval '1 minute' as requeued from outbound_orders where id = $1",
      [sendId],
    );
    expect(row).toMatchObject({ status: "pending", attempts: 0, last_error: null, requeued: true });
    expect(row.payload.delivery).toEqual({ type: "home", office: null, fee: 400, gridVersion: 3, feeToConfirm: false });
    expect((await call("GET", "/alerts")).json.data).toMatchObject({ stale: 1 });
    expect(row.payload.customer).toEqual({ name: "Amina", phone: "0661234567", wilayaId: 16, communeId: "c-16-001", address: "Rue corrigée" });
    expect(row.payload.lines).toEqual([{ sku: "X", quantity: 1 }]);
    const { rows: logs } = await harness.platform.query("select action from activity_logs where entity_id = $1", [orderId]);
    expect(logs.map((l) => l.action)).toEqual(["order.transmission_resent"]);

    const again = await call("POST", `/${sendId}/resend`);
    expect([again.status, again.json.code]).toEqual([409, "OUTBOUND_NOT_REJECTED"]);
  });

  it("queues an order created in the dashboard for transmission, like a storefront order", async () => {
    const now = new Date().toISOString();
    await harness.platform.query(
      `insert into products (merchant_id, id, name, handle, price, sku, inventory, created_at, updated_at)
       values ($1, 'p-dash', 'Dash', 'dash', 1500, 'DASH', 10, $2, $2)`,
      [TEST_MERCHANT_ID, now],
    );
    await harness.platform.query("insert into customers (store_id, id, name, phone, wilaya, created_at) values ($1, 'c-dash', 'Call Center', '0770000099', 'Alger', $2)", [harness.storeId, now]);
    const db = await harness.connect();
    await createOrder(
      db,
      {
        id: "o-dash", orderNumber: "DASH-1", customerId: "c-dash", customerName: "Call Center", phone: "0770000099",
        wilayaId: 16, communeId: "c-16-001", address: "Rue du centre", price: 1500, deliveryFee: 400, deliveryType: "home",
        status: "new", createdAt: now, updatedAt: now,
      },
      [{ id: "op-dash", orderId: "o-dash", productId: "p-dash", productName: "Dash", sku: "DASH", quantity: 1, pricePerUnit: 1500, lineTotal: 1500, createdAt: now }],
    );
    const { rows: [queued] } = await harness.platform.query("select status, payload from outbound_orders where order_id = 'o-dash'");
    expect(queued.status).toBe("pending");
    expect(queued.payload).toMatchObject({
      reference: "DASH-1",
      lines: [{ sku: "DASH", quantity: 1, unitPrice: 1500, catalogVersion: 1 }],
      delivery: { type: "home", fee: 400, feeToConfirm: false },
      customer: { name: "Call Center", phone: "0770000099", wilayaId: 16, communeId: "c-16-001", address: "Rue du centre" },
      journey: { kind: "direct" },
    });
  });

  it("cannot resend another channel's order", async () => {
    const { sendId } = await entry(other, { status: "rejected", lastOutcome: "rejected" });
    expect((await call("POST", `/${sendId}/resend`)).status).toBe(404);
  });
});
