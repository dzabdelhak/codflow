import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import { createTestDb, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import { getStoreConfig } from "../../../../cod-shared/queries/store";
import messengerRouter from "./routes";

let harness: TestDb;

function mount(role: "admin" | "staff") {
  const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
  app.use("*", async (c, next) => {
    c.env = {} as never;
    c.set("db", harness.db);
    c.set("storeId", TEST_STORE_ID);
    c.set("user", { id: "u1", email: "a@x.test", name: "A", role, status: "active", scopes: [] } as never);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/messenger-widget", messengerRouter);
  return app;
}

const call = (role: "admin" | "staff", method: string, body?: unknown) =>
  mount(role).request("/api/messenger-widget", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

beforeAll(async () => {
  harness = await createTestDb();
}, 120_000);

afterAll(async () => {
  await harness?.dispose();
});

describe("the Messenger button", () => {
  it("starts off, and shows nothing on the storefront", async () => {
    const res = await call("admin", "GET");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { config: unknown } }).data.config).toEqual({ enabled: false, page: "", position: "right", label: "" });
    expect((await getStoreConfig(harness.db, TEST_STORE_ID))?.messenger).toBeNull();
  });

  it("is saved from a pasted page link and reaches the storefront as an m.me link, never as the raw setting", async () => {
    const res = await call("admin", "PUT", { enabled: true, page: "https://www.facebook.com/MaisonLina/", position: "left", label: "Écrivez-nous" });
    expect(res.status).toBe(200);
    const config = await getStoreConfig(harness.db, TEST_STORE_ID);
    expect(config?.messenger).toEqual({ url: "https://m.me/MaisonLina", position: "left", label: "Écrivez-nous" });
    expect(config).not.toHaveProperty("messengerWidgetJson");
  });

  it("refuses to turn on without a page, and is for admins only", async () => {
    expect((await call("admin", "PUT", { enabled: true, page: "" })).status).toBe(400);
    expect((await call("staff", "PUT", { enabled: false })).status).toBe(403);
  });
});
