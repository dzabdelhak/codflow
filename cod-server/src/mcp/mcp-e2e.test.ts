import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { AppContext } from "@/types";
import { createPool, requestScope, type Database } from "@/db/scope";
import { errorHandler } from "@/middleware/error";
import { createTestDb, TEST_MERCHANT_ID, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import { verifySessionJwt } from "@/lib/session-auth";
import { ALL_SCOPES } from "../../../cod-shared/rbac/scopes";
import * as schema from "@/db/schema";
import managementRoutes from "@/endpoints/mcp/routes";
import { mcpRoutes, protectedResourceMetadata } from "./route";

const API = "http://api.test";
const JWKS_URL = "http://dashboard.test/api/auth/jwks";
const ISSUER = "http://app.test/api/auth";
const CLIENT = "client-claude";

let harness: TestDb;
let database: Database;
let app: Hono<AppContext>;
let sibling: string;
let foreignStore: string;
let signingKey: CryptoKey;
let publicJwk: JsonWebKey;

const env = () => ({
  DATABASE: database,
  BETTER_AUTH_URL: "http://app.test",
  BETTER_AUTH_JWKS_URL: JWKS_URL,
  PUBLIC_API_URL: API,
  ENVIRONMENT: "test",
});

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes).toString("base64url");

async function sign(claims: Record<string, unknown>): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "EdDSA", kid: "k1", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, signingKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(signature)}`;
}

const accessToken = (overrides: Record<string, unknown> = {}) =>
  sign({
    sub: "u-admin",
    azp: CLIENT,
    iss: ISSUER,
    aud: [`${API}/mcp`],
    scope: "offline_access orders:read orders:delete",
    store_id: TEST_STORE_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  });

async function connect(token: string) {
  const transport = new StreamableHTTPClientTransport(new URL(`${API}/mcp`), {
    fetch: async (url, init) => app.request(String(url), init as RequestInit),
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "e2e", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(transport);
  return client;
}

const post = (token: string) =>
  app.request(`${API}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });

async function consent(userId: string, storeId: string, scopes: string[], clientId = CLIENT) {
  await harness.platform.query(
    `insert into "oauthConsents" (id, client_id, user_id, reference_id, scopes) values ($1, $2, $3, $4, $5)`,
    [`consent-${userId}-${storeId}-${clientId}`, clientId, userId, storeId, scopes],
  );
}

async function seedOrder(storeId: string, n: number) {
  const db = await harness.connect(storeId);
  const now = new Date().toISOString();
  await db.insert(schema.customers).values({ id: `c-${n}`, name: "Test", phone: `0550${String(n).padStart(6, "0")}`, wilaya: "Alger", createdAt: now });
  await db.insert(schema.orders).values({
    id: `o-${n}`, orderNumber: `MCP-${n}`, customerId: `c-${n}`, customerName: "Test", phone: `0550${String(n).padStart(6, "0")}`,
    deliveryType: "home", price: 1000, deliveryFee: 0, createdAt: now, updatedAt: now,
  });
}

beforeAll(async () => {
  harness = await createTestDb();
  sibling = await harness.createStore("mcp-sibling");
  const foreignMerchant = await harness.createMerchant("mcp-foreign");
  foreignStore = await harness.createStore("mcp-foreign-store", [], foreignMerchant);
  const appPool = createPool(harness.url, "codflow_app", 10);
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };

  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  signingKey = pair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "EdDSA" } as JsonWebKey & { kid: string };
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    String(input) === JWKS_URL ? Promise.resolve(Response.json({ keys: [publicJwk] })) : realFetch(input, init));

  await harness.platform.query(
    `insert into users (id, name, email, role, status, merchant_id) values
       ('u-admin', 'Admin', 'admin@mcp.test', 'admin', 'active', $1),
       ('u-staff', 'Staff', 'staff@mcp.test', 'staff', 'active', $1),
       ('u-foreign', 'Other', 'other@mcp.test', 'admin', 'active', $2)`,
    [TEST_MERCHANT_ID, foreignMerchant],
  );
  await harness.platform.query(
    `insert into user_scopes (id, user_id, scope, granted_at) values ('us-1', 'u-staff', 'orders:read', now()::text)`,
  );
  await harness.platform.query(
    `insert into "oauthClients" (id, client_id, name, redirect_uris, public) values ('oc-1', $1, 'Claude', array['http://localhost/cb'], true)`,
    [CLIENT],
  );
  await seedOrder(TEST_STORE_ID, 1);
  await seedOrder(sibling, 2);
  const now = new Date().toISOString();
  await harness.db.insert(schema.products).values({ id: "p-mug", name: "Mug", handle: "mug", price: 1200, sku: "MUG", inventory: 5, createdAt: now, updatedAt: now });
  await harness.platform.query(
    "insert into channel_products (store_id, product_id, published, position, created_at, updated_at) values ($1, 'p-mug', false, 0, now()::text, now()::text)",
    [sibling],
  );

  app = new Hono<AppContext>();
  app.use("*", async (c, next) => {
    c.env = env() as never;
    await next();
  });
  app.onError(errorHandler);
  app.get("/.well-known/oauth-protected-resource/mcp", protectedResourceMetadata);
  app.route("/mcp", mcpRoutes);
  app.use("/api/*", async (c, next) => {
    const id = c.req.header("X-Test-User") ?? "u-admin";
    const { rows: [user] } = await harness.platform.query("select * from users where id = $1", [id]);
    c.set("user", { ...user, merchantId: user.merchant_id, scopes: [] } as never);
    await next();
  });
  app.use("/api/*", requestScope(async () => ({ storeId: TEST_STORE_ID, merchantId: TEST_MERCHANT_ID })));
  app.route("/api/mcp", managementRoutes);
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await database?.close();
  await harness?.dispose();
});

beforeEach(async () => {
  await harness.platform.query(`delete from "oauthConsents"`);
  await harness.platform.query(`update users set status = 'active'`);
});

describe("the MCP server", () => {
  it("challenges a request without a token with the protected resource metadata", async () => {
    const res = await app.request(`${API}/mcp`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain(`resource_metadata="${API}/.well-known/oauth-protected-resource/mcp"`);

    const metadata = (await (await app.request(`${API}/.well-known/oauth-protected-resource/mcp`)).json()) as { scopes_supported: string[] };
    expect(metadata).toMatchObject({ resource: `${API}/mcp`, authorization_servers: [ISSUER], bearer_methods_supported: ["header"] });
    expect(metadata.scopes_supported).toContain("orders:read");
  });

  it("serves the channel the merchant chose, with only the tools of the scopes consented to", async () => {
    await consent("u-admin", TEST_STORE_ID, ["offline_access", "orders:read"]);
    const client = await connect(await accessToken());

    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("listOrders");
    expect(tools).not.toContain("deleteOrder");

    const result = await client.callTool({ name: "listOrders", arguments: {} });
    const text = JSON.stringify(result.content);
    expect(text).toContain("MCP-1");
    expect(text).not.toContain("MCP-2");
    await client.close();
  });

  it("lists the products as the chosen channel shows them", async () => {
    await consent("u-admin", TEST_STORE_ID, ["products:read"]);
    await consent("u-admin", sibling, ["products:read"]);
    const shown = async (storeId: string) => {
      const client = await connect(await accessToken({ store_id: storeId, scope: "products:read" }));
      const result = await client.callTool({ name: "listProducts", arguments: {} });
      await client.close();
      return (result.structuredContent as { products: Array<{ id: string; showInStore: boolean }> }).products.map((p) => [p.id, p.showInStore]);
    };
    expect(await shown(TEST_STORE_ID)).toEqual([["p-mug", true]]);
    expect(await shown(sibling)).toEqual([["p-mug", false]]);
  });

  it("answers every list tool within its declared output schema", async () => {
    await consent("u-admin", TEST_STORE_ID, [...ALL_SCOPES]);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = await connect(await accessToken({ scope: ALL_SCOPES.join(" ") }));
    const lists = (await client.listTools()).tools.filter((t) => t.name.startsWith("list") && !t.inputSchema.required?.length);
    expect(lists.length).toBeGreaterThan(5);
    const failed: string[] = [];
    for (const tool of lists) {
      const result = await client.callTool({ name: tool.name, arguments: {} });
      if (result.isError || (tool.outputSchema && !result.structuredContent)) failed.push(`${tool.name}: ${JSON.stringify(result.content).slice(0, 300)}`);
    }
    await client.close();
    errors.mockRestore();
    expect(failed).toEqual([]);
  });

  it("keeps a staff connection within the scopes the user still holds", async () => {
    await consent("u-staff", TEST_STORE_ID, ["orders:read", "orders:delete"]);
    const client = await connect(await accessToken({ sub: "u-staff" }));
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("listOrders");
    expect(tools).not.toContain("deleteOrder");
    await client.close();
  });

  it("refuses a channel the connection was not authorised for", async () => {
    await consent("u-admin", TEST_STORE_ID, ["orders:read"]);
    expect((await post(await accessToken({ store_id: sibling }))).status).toBe(401);
    expect((await post(await accessToken({ store_id: foreignStore }))).status).toBe(403);
  });

  it("refuses a token for another resource, from another issuer, expired or tampered with", async () => {
    await consent("u-admin", TEST_STORE_ID, ["orders:read"]);
    expect((await post(await accessToken({ aud: API }))).status).toBe(401);
    expect((await post(await accessToken({ iss: "http://evil.test/api/auth" }))).status).toBe(401);
    expect((await post(await accessToken({ exp: Math.floor(Date.now() / 1000) - 10 }))).status).toBe(401);
    expect((await post(await accessToken({ exp: undefined }))).status).toBe(401);
    const [head, , sig] = (await accessToken()).split(".");
    expect((await post(`${head}.${b64url(JSON.stringify({ sub: "u-admin", store_id: sibling }))}.${sig}`)).status).toBe(401);
  });

  it("keeps dashboard sessions and MCP tokens apart", async () => {
    await consent("u-admin", TEST_STORE_ID, ["orders:read"]);
    const session = await sign({ sub: "u-admin", iss: "http://app.test", aud: API, exp: Math.floor(Date.now() / 1000) + 600 });
    expect((await post(session)).status).toBe(401);
    await expect(verifySessionJwt(await accessToken(), env())).rejects.toThrow();
  });

  it("refuses a token issued before the connection was last authorised", async () => {
    const before = await accessToken({ iat: Math.floor(Date.now() / 1000) - 120 });
    await consent("u-admin", TEST_STORE_ID, ["orders:read"]);
    expect((await post(before)).status).toBe(401);
    expect((await post(await accessToken({ iat: undefined }))).status).toBe(401);
    const client = await connect(await accessToken());
    expect((await client.listTools()).tools.map((t) => t.name)).toContain("listOrders");
    await client.close();
  });

  it("stops serving a user who was deactivated", async () => {
    await consent("u-admin", TEST_STORE_ID, ["orders:read"]);
    await harness.platform.query(`update users set status = 'inactive' where id = 'u-admin'`);
    expect((await post(await accessToken())).status).toBe(403);
  });
});

describe("the connections page", () => {
  it("lists a connection per channel and revokes one, which the server then refuses", async () => {
    await consent("u-admin", TEST_STORE_ID, ["orders:read"]);
    await consent("u-admin", sibling, ["orders:read"]);
    await harness.platform.query(
      `insert into "oauthRefreshTokens" (id, token, client_id, user_id, reference_id, expires_at, scopes)
       values ('rt-1', 'rt-1', $1, 'u-admin', $2, now() + interval '1 day', array['orders:read'])`,
      [CLIENT, TEST_STORE_ID],
    );

    const mine = (await (await app.request("/api/mcp/me")).json()) as { data: Array<{ storeId: string; active: boolean }> };
    expect(mine.data.map((c) => [c.storeId, c.active]).sort()).toEqual(
      [[TEST_STORE_ID, true], [sibling, false]].sort(),
    );
    expect(mine.data[0]).toMatchObject({ clientId: CLIENT, clientName: "Claude" });

    const revoked = await app.request(`/api/mcp/connections/${CLIENT}?storeId=${TEST_STORE_ID}`, { method: "DELETE" });
    expect(revoked.status).toBe(200);
    expect((await post(await accessToken())).status).toBe(401);
    const stillServed = await connect(await accessToken({ store_id: sibling }));
    expect((await stillServed.listTools()).tools.map((t) => t.name)).toContain("listOrders");
    await stillServed.close();
    const { rows: [token] } = await harness.platform.query(`select revoked from "oauthRefreshTokens" where id = 'rt-1'`);
    expect(token.revoked).not.toBeNull();

    expect((await app.request(`/api/mcp/connections/${CLIENT}?storeId=${TEST_STORE_ID}`, { method: "DELETE" })).status).toBe(404);
  });

  it("shows and revokes only the merchant's own connections", async () => {
    await consent("u-staff", TEST_STORE_ID, ["orders:read"]);
    await consent("u-foreign", foreignStore, ["orders:read"]);

    const team = (await (await app.request("/api/mcp/team")).json()) as { data: Array<{ user: { id: string } }> };
    expect(team.data.map((c) => c.user.id)).toEqual(["u-staff"]);

    expect((await app.request(`/api/mcp/connections/${CLIENT}/users/u-foreign`, { method: "DELETE" })).status).toBe(404);
    const deleted = await app.request(`/api/mcp/clients/${CLIENT}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);

    const { rows: left } = await harness.platform.query(`select user_id from "oauthConsents"`);
    expect(left).toEqual([{ user_id: "u-foreign" }]);
    const { rows: clients } = await harness.platform.query(`select client_id from "oauthClients"`);
    expect(clients).toHaveLength(1);
  });
});
