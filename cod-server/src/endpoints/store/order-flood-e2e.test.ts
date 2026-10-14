import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, requestScope, type Database } from "@/db/scope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import { createTestDb, TEST_MERCHANT_ID, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import * as schema from "@/db/schema";
import storeRouter from "./routes";
import abandonedRouter from "@/endpoints/abandoned-orders/store-routes";

let harness: TestDb;
let database: Database;
let app: OpenAPIHono<AppContext>;
let sibling: string;
let phoneSeq = 0;
const NOW = () => new Date().toISOString();

const nextPhone = () => `0550${String(++phoneSeq).padStart(6, "0")}`;

function order(body: Record<string, unknown> = {}, headers: Record<string, string> = {}, store = TEST_STORE_ID) {
  return app.request("/store/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Store": store, "X-Visitor-IP": "41.100.1.2", ...headers },
    body: JSON.stringify({
      customerName: "Amina Test",
      phone: "0550123456",
      wilayaId: 16,
      communeId: "c-16-001",
      address: "Rue des tests",
      deliveryType: "home",
      productId: "p-shirt",
      productName: "Shirt",
      pricePerUnit: 2500,
      quantity: 1,
      ...body,
    }),
  });
}

const count = async (table: string, store = TEST_STORE_ID) =>
  Number((await harness.platform.query(`select count(*)::int as n from ${table} where store_id = $1`, [store])).rows[0].n);

const attempts = async (store = TEST_STORE_ID) =>
  (await harness.platform.query("select reason, phone, device_id, ip_address, order_number, details from blocked_order_attempts where store_id = $1 order by created_at", [store])).rows;

beforeAll(async () => {
  harness = await createTestDb();
  sibling = await harness.createStore("flood-sibling", [], TEST_MERCHANT_ID);
  const appPool = createPool(harness.url, "codflow_app", 10);
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
  app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
  app.use("*", async (c, next) => {
    c.env = { DATABASE: database, ORDER_IP_CEILING_PER_HOUR: "3" } as never;
    await next();
  });
  app.use("*", requestScope(async (c) => ({ storeId: c.req.header("X-Test-Store") ?? TEST_STORE_ID, merchantId: TEST_MERCHANT_ID })));
  app.onError(errorHandler);
  app.route("/store", storeRouter);
  app.route("/store", abandonedRouter);

  await harness.setStore({ name: "Nour", orderPrefix: "NOUR", createdAt: NOW(), updatedAt: NOW() });
  await harness.platform.query("update stores set order_prefix = 'SIB' where id = $1", [sibling]);
  await harness.db.insert(schema.products).values([
    { id: "p-shirt", name: "Shirt", handle: "shirt", price: 2500, sku: "SHIRT", inventory: 10000, createdAt: NOW(), updatedAt: NOW() },
    { id: "p-last", name: "Last one", handle: "last", price: 4000, sku: "LAST", inventory: 1, createdAt: NOW(), updatedAt: NOW() },
  ]);
  await harness.platform.query(
    "insert into channel_products (store_id, product_id, published, position, created_at, updated_at) values ($1, 'p-shirt', true, 0, now()::text, now()::text)",
    [sibling],
  );
  await harness.db.insert(schema.shippingProfiles).values({ id: "sp", name: "Default", isDefault: true, createdAt: NOW(), updatedAt: NOW() });
  await harness.db.insert(schema.shippingRules).values({
    id: "sr", profileId: "sp", wilayaId: 16, homePrice: 400, stopDeskPrice: 250, homeEnabled: true, stopDeskEnabled: true, createdAt: NOW(),
  });
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

beforeEach(async () => {
  await harness.platform.query("delete from blocked_order_attempts");
  await harness.platform.query("delete from blocked_phones");
  await harness.platform.query("update stores set order_limit_minutes = 10");
  await harness.platform.query("update orders set ip_address = null");
});

describe("one order per phone every 10 minutes", () => {
  it("answers a second order like a success, creates nothing, and logs the attempt", async () => {
    const phone = nextPhone();
    const first = await order({ phone });
    expect(first.status).toBe(201);
    const [orders, outbound] = [await count("orders"), await count("outbound_orders")];

    const second = await order({ phone, customerName: "Amina Again", quantity: 2 });
    expect(second.status).toBe(201);
    const blocked = (await second.json()) as { success: boolean; data: Record<string, unknown> };
    const real = (await first.json()) as { data: Record<string, unknown> };
    expect(Object.keys(blocked.data).sort()).toEqual(Object.keys(real.data).sort());
    expect(blocked.data.orderNumber).toMatch(/^NOUR-\d{5}$/);
    expect(blocked.data.orderNumber).not.toBe(real.data.orderNumber);
    expect(blocked.data).toMatchObject({ price: 5000, deliveryFee: 400, total: 5400 });

    expect(await count("orders")).toBe(orders);
    expect(await count("outbound_orders")).toBe(outbound);
    expect(await attempts()).toEqual([
      {
        reason: "phone_window",
        phone,
        device_id: null,
        ip_address: "41.100.1.2",
        order_number: blocked.data.orderNumber,
        details: { lines: [{ productName: "Shirt", quantity: 2 }], total: 5400 },
      },
    ]);
  });

  it("takes the next order once the window has passed", async () => {
    const phone = nextPhone();
    await order({ phone });
    await harness.platform.query("update orders set created_at = (now() - interval '11 minutes')::text where phone = $1", [phone]);
    const before = await count("orders");
    await order({ phone });
    expect(await count("orders")).toBe(before + 1);
    expect(await attempts()).toEqual([]);
  });

  it("does not count an order the merchant cancelled", async () => {
    const phone = nextPhone();
    await order({ phone });
    await harness.platform.query("update orders set status = 'cancelled' where phone = $1", [phone]);
    const before = await count("orders");
    await order({ phone });
    expect(await count("orders")).toBe(before + 1);
  });

  it("answers what a real order would about stock, so the block cannot be told apart", async () => {
    const phone = nextPhone();
    const item = { productId: "p-last", productName: "Last one", pricePerUnit: 4000, quantity: 2 };
    const real = (await (await order({ phone, ...item })).json()) as { data: { stockConfirmed: boolean } };
    const blocked = (await (await order({ phone, ...item })).json()) as { data: { stockConfirmed: boolean } };
    expect(real.data.stockConfirmed).toBe(false);
    expect(blocked.data.stockConfirmed).toBe(false);
    expect((await attempts())[0]).toMatchObject({ reason: "phone_window" });
  });

  it("never marks the shopper's abandoned checkout as converted to an order that does not exist", async () => {
    const phone = nextPhone();
    const sessionId = crypto.randomUUID();
    await app.request("/store/abandoned", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-Store": TEST_STORE_ID },
      body: JSON.stringify({ sessionId, customerName: "Lead Kept", phone }),
    });
    await order({ phone });
    const blocked = (await (await order({ phone })).json()) as { data: { orderId: string; orderNumber: string } };
    await app.request(`/store/abandoned/${sessionId}/convert`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Test-Store": TEST_STORE_ID },
      body: JSON.stringify({ orderId: blocked.data.orderId, orderNumber: blocked.data.orderNumber }),
    });
    const { rows: [lead] } = await harness.platform.query("select status, converted_order_id from abandoned_orders where session_id = $1", [sessionId]);
    expect(lead.converted_order_id).toBeNull();
    expect(lead.status).not.toBe("converted");

    const { rows: [real] } = await harness.platform.query("select id, order_number from orders where phone = $1", [phone]);
    await app.request(`/store/abandoned/${sessionId}/convert`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Test-Store": TEST_STORE_ID },
      body: JSON.stringify({ orderId: real.id, orderNumber: real.order_number }),
    });
    const { rows: [converted] } = await harness.platform.query("select status, converted_order_id from abandoned_orders where session_id = $1", [sessionId]);
    expect(converted).toEqual({ status: "converted", converted_order_id: real.id });
  });

  it("stops logging and spending order numbers once a flood fills the log", async () => {
    await harness.platform.query(
      `insert into blocked_order_attempts (store_id, id, reason, order_number, phone, customer_name, details)
       select $1, 'cap-' || n, 'phone_window', 'NOUR-00000', '0550000000', 'Flood', '{"lines":[],"total":null}' from generate_series(1, 100) n`,
      [TEST_STORE_ID],
    );
    const phone = nextPhone();
    await order({ phone });
    const { rows: [{ order_seq: before }] } = await harness.platform.query("select order_seq from stores where id = $1", [TEST_STORE_ID]);
    const blocked = (await (await order({ phone })).json()) as { data: { orderNumber: string } };
    const { rows: [{ order_seq: after }] } = await harness.platform.query("select order_seq from stores where id = $1", [TEST_STORE_ID]);
    expect(after).toBe(before);
    expect(blocked.data.orderNumber).toBe(`NOUR-${String(before + 1).padStart(5, "0")}`);
    expect(await attempts()).toHaveLength(100);
  });

  it("follows the channel's own window, and none at all when it is 0", async () => {
    const phone = nextPhone();
    await order({ phone });
    await harness.platform.query("update stores set order_limit_minutes = 0 where id = $1", [TEST_STORE_ID]);
    const before = await count("orders");
    await order({ phone });
    expect(await count("orders")).toBe(before + 1);
  });

  it("applies to the device too, whatever phone it uses", async () => {
    const device = "device-flood-1";
    await order({ phone: nextPhone(), attribution: JSON.stringify({ deviceId: device }) });
    const before = await count("orders");
    await order({ phone: nextPhone(), attribution: JSON.stringify({ deviceId: device }) });
    expect(await count("orders")).toBe(before);
    expect((await attempts())[0]).toMatchObject({ reason: "device_window", device_id: device });
  });

  it("lets only one of two simultaneous submits through", async () => {
    const phone = nextPhone();
    const before = await count("orders");
    const results = await Promise.all([order({ phone }), order({ phone })]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await count("orders")).toBe(before + 1);
    expect(await attempts()).toHaveLength(1);
  });

  it("keeps the device id on the order and in the payload sent to Aventy", async () => {
    const res = await order({ phone: nextPhone(), attribution: JSON.stringify({ deviceId: "device-kept" }) });
    const { data } = (await res.json()) as { data: { orderId: string } };
    const { rows: [row] } = await harness.platform.query(
      "select o.device_id, q.payload->'traces'->>'deviceId' as traced from orders o join outbound_orders q on q.order_id = o.id where o.id = $1",
      [data.orderId],
    );
    expect(row).toEqual({ device_id: "device-kept", traced: "device-kept" });
  });
});

describe("the per-IP ceiling", () => {
  it("flags orders past the ceiling, drops them past three times it, and counts the address the storefront saw", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await order({ phone: nextPhone() }, { "X-Forwarded-For": `10.0.0.${i}` })).status).toBe(201);
    }
    const before = await count("orders");
    await order({ phone: nextPhone() }, { "X-Forwarded-For": "10.9.9.9" });
    expect(await count("orders")).toBe(before + 1);
    expect((await attempts())[0]).toMatchObject({ reason: "ip_flagged", ip_address: "41.100.1.2" });
    const { rows: [flagged] } = await harness.platform.query("select 1 from orders where order_number = $1", [(await attempts())[0].order_number]);
    expect(flagged).toBeTruthy();

    for (let i = 0; i < 5; i++) await order({ phone: nextPhone() });
    const atHardCeiling = await count("orders");
    await order({ phone: nextPhone() }, { "X-Forwarded-For": "10.9.9.10" });
    expect(await count("orders")).toBe(atHardCeiling);
    expect((await attempts()).at(-1)).toMatchObject({ reason: "ip_ceiling", ip_address: "41.100.1.2" });

    await order({ phone: nextPhone() }, { "X-Visitor-IP": "41.100.7.7" });
    expect(await count("orders")).toBe(atHardCeiling + 1);
  });

  it("treats an IPv6 /64 as one address", async () => {
    for (let i = 1; i <= 9; i++) await order({ phone: nextPhone() }, { "X-Visitor-IP": `2001:db8:1:2::${i}` });
    const before = await count("orders");
    await order({ phone: nextPhone() }, { "X-Visitor-IP": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" });
    expect(await count("orders")).toBe(before);
    await order({ phone: nextPhone() }, { "X-Visitor-IP": "2001:db8:1:3::1" });
    expect(await count("orders")).toBe(before + 1);
  });
});

describe("the account's phone blocklist", () => {
  it("blocks the phone in every channel of the account", async () => {
    const phone = nextPhone();
    await harness.platform.query("insert into blocked_phones (merchant_id, id, phone) values ($1, 'bp-1', $2)", [TEST_MERCHANT_ID, phone]);
    const [mine, theirs] = [await count("orders"), await count("orders", sibling)];

    expect((await order({ phone })).status).toBe(201);
    expect((await order({ phone }, {}, sibling)).status).toBe(201);

    expect(await count("orders")).toBe(mine);
    expect(await count("orders", sibling)).toBe(theirs);
    expect((await attempts())[0]).toMatchObject({ reason: "blocked_phone", phone });
    expect((await attempts(sibling))[0]).toMatchObject({ reason: "blocked_phone", phone });
  });
});
