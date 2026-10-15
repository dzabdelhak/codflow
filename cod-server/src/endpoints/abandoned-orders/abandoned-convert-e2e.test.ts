import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, TEST_MERCHANT_ID, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import ordersRoutes from "@/endpoints/orders/routes";
import abandonedRoutes from "./routes";

let harness: TestDb;
let database: Database;
let communeId: string;

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.route("/api/orders", ordersRoutes);
app.route("/api/abandoned-orders", abandonedRoutes);

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(
    path,
    {
      method,
      headers: { "X-API-Key": "key-recover", "X-Store-Id": TEST_STORE_ID, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    { DATABASE: database } as never,
  );
  return { status: res.status, json: (await res.json()) as { data: Record<string, any>; code?: string } };
};

beforeAll(async () => {
  harness = await createTestDb();
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-recover', 'Agent', 'recover@x.test', 'admin', 'key-recover', $1, now(), now())`,
    [TEST_MERCHANT_ID],
  );
  await harness.platform.query(
    `insert into products (id, merchant_id, name, handle, price, sku, inventory, created_at, updated_at)
     values ('p-watch', $1, 'Montre', 'montre', 3000, 'W-1', 10, '', '')`,
    [TEST_MERCHANT_ID],
  );
  communeId = (await harness.platform.query<{ id: string }>("select id from communes where wilaya_id = 16 order by id limit 1")).rows[0].id;
  await harness.platform.query(
    `insert into abandoned_orders (store_id, id, session_id, customer_name, phone, wilaya_id, commune_id, product_id, product_name, price,
                                   items_json, item_count, delivery_type, status, created_at, updated_at)
     values ($1, 'ab-1', 's-1', 'Samira K', '0551234567', 16, $2, 'p-watch', 'Montre', 6000,
             '[{"productId":"p-watch","productName":"Montre","quantity":2,"unitPrice":3000}]', 1, 'stop_desk', 'abandoned', now()::text, now()::text)`,
    [TEST_STORE_ID, communeId],
  );
  const appPool = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("turning an abandoned cart into an order", () => {
  it("reads the cart with its basket, then creates the order and links them, once", async () => {
    const cart = await call("GET", "/api/abandoned-orders/ab-1");
    expect(cart.status).toBe(200);
    expect(cart.json.data).toMatchObject({ customerName: "Samira K", phone: "0551234567", wilayaId: 16, deliveryType: "stop_desk" });
    expect(cart.json.data.items).toEqual([{ productId: "p-watch", productName: "Montre", quantity: 2, unitPrice: 3000 }]);

    const order = {
      customerId: "0551234567", customerName: "Samira K", phone: "0551234567", wilayaId: 16, communeId,
      price: 6000, orderType: "offline", deliveryType: "stop_desk", deliveryFee: 300, abandonedOrderId: "ab-1",
      products: [{ productId: "p-watch", productName: "Montre", quantity: 2, pricePerUnit: 3000, lineTotal: 6000 }],
    };
    const created = await call("POST", "/api/orders", order);
    expect(created.status).toBe(201);
    const { rows: [row] } = await harness.platform.query("select status, converted_order_id, converted_order_number from abandoned_orders where id = 'ab-1'");
    expect(row).toEqual({ status: "converted", converted_order_id: created.json.data.id, converted_order_number: created.json.data.orderNumber });

    const again = await call("POST", "/api/orders", order);
    expect([again.status, again.json.code]).toEqual([409, "ABANDONED_ORDER_CONVERTED"]);
    const orders = await harness.platform.query("select count(*)::int as n from orders where store_id = $1", [TEST_STORE_ID]);
    expect(orders.rows[0].n).toBe(1);
  });

  it("refuses a cart that does not exist", async () => {
    const res = await call("POST", "/api/orders", {
      customerId: "0551234568", customerName: "X", phone: "0551234568", wilayaId: 16, communeId, price: 3000, orderType: "offline",
      deliveryType: "stop_desk", deliveryFee: 300, abandonedOrderId: "nope",
      products: [{ productId: "p-watch", productName: "Montre", quantity: 1, pricePerUnit: 3000, lineTotal: 3000 }],
    });
    expect(res.status).toBe(404);
  });
});
