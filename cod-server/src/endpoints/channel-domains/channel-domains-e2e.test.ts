/**
 * Custom domains (ticket 11), on PostgreSQL through the real auth, dashboard
 * scope and storefront resolution, with a fake DNS: a typed-in domain stays
 * pending and serves nothing until its DNS points at the platform; Caddy only
 * gets a certificate for verified domains; the primary domain is the one the
 * storefront redirects to.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { storeAuthMiddleware } from "@/middleware/storeAuth";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import storeRoutes from "../store/routes";
import channelDomainRoutes, { tlsAskRouter } from "./routes";
import type { DnsLookup } from "@/platform/channel-domains";

const KEY = "storefront-domains-key";
let harness: TestDb;
let database: Database;
let store: string;
let other: string;

const records: Record<string, { cname?: string[]; a?: string[] }> = {};
const fakeDns: DnsLookup = {
  cname: async (host) => {
    if (records[host]?.cname) return records[host].cname!;
    throw Object.assign(new Error("no data"), { code: "ENODATA" });
  },
  a: async (host) => {
    if (records[host]?.a) return records[host].a!;
    throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  },
};

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.use("/store/*", storeAuthMiddleware);
app.route("/api/channel-domains", channelDomainRoutes);
app.route("/store", storeRoutes);
app.route("/platform/tls-ask", tlsAskRouter);

const env = () =>
  ({
    DATABASE: database,
    STOREFRONT_SERVICE_KEY: KEY,
    STORE_BASE_DOMAIN: "codflow.test",
    CUSTOM_DOMAIN_TARGET: "stores.codflow.test",
    CUSTOM_DOMAIN_IPV4: "203.0.113.10",
    DOMAIN_DNS: fakeDns,
    CERT_PROBE: async () => ({ status: "missing" }),
  }) as never;

type Domain = { hostname: string; kind: string; status: string; isPrimary: boolean; lastError: string | null; certificate: unknown };

async function dashboard(method: string, path: string, body?: unknown, storeId = store) {
  const res = await app.request(
    path,
    {
      method,
      headers: { "X-API-Key": "key-domains", "Content-Type": "application/json", "X-Store-Id": storeId },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env(),
  );
  return { status: res.status, json: (await res.json()) as { data: { domains: Domain[]; dns: unknown }; code?: string } };
}

const domainOf = async (hostname: string, storeId = store) =>
  (await dashboard("GET", "/api/channel-domains", undefined, storeId)).json.data.domains.find((d) => d.hostname === hostname);

async function storefront(host: string) {
  return app.request("/store/config", { headers: { "X-Storefront-Key": KEY, "X-Channel-Host": host } }, env());
}

const tlsAsk = async (domain: string) => (await app.request(`/platform/tls-ask?domain=${domain}`, {}, env())).status;

beforeAll(async () => {
  harness = await createTestDb();
  store = await harness.createStore("dom-shop", ["dom-shop.codflow.test"]);
  other = await harness.createStore("dom-other", ["dom-other.codflow.test"]);
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-domains', 'Domains', 'domains@x.test', 'admin', 'key-domains', 'test-merchant', now(), now())`,
  );
  const appPool = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

describe("adding a domain", () => {
  it("lists the free subdomain as verified and primary, with the DNS target to use", async () => {
    const { json } = await dashboard("GET", "/api/channel-domains");
    expect(json.data.domains).toMatchObject([{ hostname: "dom-shop.codflow.test", kind: "subdomain", status: "verified", isPrimary: true }]);
    expect(json.data.dns).toEqual({ cname: "stores.codflow.test", ipv4: ["203.0.113.10"] });
  });

  it("refuses something that is not a domain, or one under the platform's own domain", async () => {
    for (const hostname of ["not a domain", "localhost", "evil.codflow.test", "codflow.test"]) {
      const res = await dashboard("POST", "/api/channel-domains", { hostname });
      expect(res.status, hostname).toBe(400);
      expect(res.json.code).toBe("INVALID_DOMAIN");
    }
  });

  it("adds a typed-in domain as pending: no traffic, no certificate", async () => {
    const res = await dashboard("POST", "/api/channel-domains", { hostname: "https://Boutique-Nour.dz/" });
    expect(res.status).toBe(201);
    expect(await domainOf("boutique-nour.dz")).toMatchObject({ kind: "custom", status: "pending", isPrimary: false });
    expect((await storefront("boutique-nour.dz")).status).toBe(404);
    expect(await tlsAsk("boutique-nour.dz")).toBe(404);
    expect((await dashboard("POST", "/api/channel-domains", { hostname: "boutique-nour.dz" })).json.code).toBe("DOMAIN_ALREADY_ADDED");
  });

  it("keeps a domain to the channel that claimed it, until an unverified claim goes stale", async () => {
    const taken = await dashboard("POST", "/api/channel-domains", { hostname: "boutique-nour.dz" }, other);
    expect([taken.status, taken.json.code]).toEqual([409, "DOMAIN_TAKEN"]);

    await harness.platform.query(
      "insert into store_domains (hostname, store_id, kind, created_at, status) values ('old-claim.dz', $1, 'custom', '2020-01-01T00:00:00.000Z', 'pending')",
      [other],
    );
    expect((await dashboard("POST", "/api/channel-domains", { hostname: "old-claim.dz" })).status).toBe(201);
    expect(await domainOf("old-claim.dz")).toMatchObject({ status: "pending" });
  });
});

describe("verification", () => {
  it("fails with the reason while the DNS points elsewhere or nowhere", async () => {
    let res = await dashboard("POST", "/api/channel-domains/boutique-nour.dz/verify");
    expect(res.json.data.domains.find((d) => d.hostname === "boutique-nour.dz")).toMatchObject({ status: "failed", lastError: "no_dns_records" });

    records["boutique-nour.dz"] = { a: ["198.51.100.7"] };
    res = await dashboard("POST", "/api/channel-domains/boutique-nour.dz/verify");
    expect(res.json.data.domains.find((d) => d.hostname === "boutique-nour.dz")).toMatchObject({
      status: "failed",
      lastError: "points_elsewhere:198.51.100.7",
    });
    expect((await storefront("boutique-nour.dz")).status).toBe(404);
  });

  it("succeeds once the domain points at the platform, then serves it and allows its certificate", async () => {
    records["boutique-nour.dz"] = { cname: ["stores.codflow.test."] };
    const res = await dashboard("POST", "/api/channel-domains/boutique-nour.dz/verify");
    expect(res.json.data.domains.find((d) => d.hostname === "boutique-nour.dz")).toMatchObject({
      status: "verified",
      lastError: null,
      certificate: { status: "missing" },
    });
    expect((await storefront("boutique-nour.dz")).status).toBe(200);
    expect(await tlsAsk("boutique-nour.dz")).toBe(200);
    expect(await tlsAsk("dom-shop.codflow.test")).toBe(200);
    expect(await tlsAsk("never-added.dz")).toBe(404);
  });

  it("accepts a root domain whose A records point at the platform's address", async () => {
    await dashboard("POST", "/api/channel-domains", { hostname: "nour.dz" });
    records["nour.dz"] = { a: ["203.0.113.10"] };
    const res = await dashboard("POST", "/api/channel-domains/nour.dz/verify");
    expect(res.json.data.domains.find((d) => d.hostname === "nour.dz")?.status).toBe("verified");
  });
});

describe("the primary domain", () => {
  it("can only be a verified domain", async () => {
    const res = await dashboard("POST", "/api/channel-domains/old-claim.dz/primary");
    expect([res.status, res.json.code]).toEqual([409, "DOMAIN_NOT_VERIFIED"]);
  });

  it("is what the storefront redirects the channel's other domains to", async () => {
    const before = (await (await storefront("dom-shop.codflow.test")).json()) as { data: { primaryHostname: string } };
    expect(before.data.primaryHostname).toBe("dom-shop.codflow.test");

    const res = await dashboard("POST", "/api/channel-domains/boutique-nour.dz/primary");
    expect(res.json.data.domains[0]).toMatchObject({ hostname: "boutique-nour.dz", isPrimary: true });
    expect(res.json.data.domains.filter((d) => d.isPrimary)).toHaveLength(1);

    const after = (await (await storefront("dom-shop.codflow.test")).json()) as { data: { primaryHostname: string } };
    expect(after.data.primaryHostname).toBe("boutique-nour.dz");
    const { rows: [row] } = await harness.platform.query("select domain from stores where id = $1", [store]);
    expect(row.domain).toBe("boutique-nour.dz");
  });

  it("stops being redirected to once its DNS no longer points at the platform", async () => {
    records["boutique-nour.dz"] = { a: ["198.51.100.7"] };
    await dashboard("POST", "/api/channel-domains/boutique-nour.dz/verify");
    const config = (await (await storefront("dom-shop.codflow.test")).json()) as { data: { primaryHostname: string | null } };
    expect(config.data.primaryHostname).toBeNull();
    records["boutique-nour.dz"] = { cname: ["stores.codflow.test"] };
    await dashboard("POST", "/api/channel-domains/boutique-nour.dz/verify");
  });
});

describe("removing a domain", () => {
  it("refuses the free subdomain and the primary domain, removes the others, and logs every change", async () => {
    expect((await dashboard("DELETE", "/api/channel-domains/dom-shop.codflow.test")).json.code).toBe("DOMAIN_NOT_REMOVABLE");
    expect((await dashboard("DELETE", "/api/channel-domains/boutique-nour.dz")).json.code).toBe("DOMAIN_NOT_REMOVABLE");

    expect((await dashboard("DELETE", "/api/channel-domains/nour.dz")).status).toBe(200);
    expect((await storefront("nour.dz")).status).toBe(404);
    expect(await tlsAsk("nour.dz")).toBe(404);

    const { rows } = await harness.platform.query(
      "select action, entity_id from activity_logs where store_id = $1 and entity_type = 'domain' order by created_at",
      [store],
    );
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["domain.added", "domain.verification_failed", "domain.verified", "domain.primary_set", "domain.removed"]),
    );
  });
});
