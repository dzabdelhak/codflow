/**
 * Cache contracts & invariants.
 *
 * Server-side SWR caching protects the platform from traffic spikes and keeps
 * mobile TTFB in Algeria low. One storefront serves every channel, so the
 * cache must key on the hostname as well as the path.
 *
 * Senior-dev invariants:
 *   1. High-traffic catalog & marketing pages MUST have SWR edge cache rules.
 *   2. Communes (immutable administrative data) MUST have long-lived cache.
 *   3. Transactional routes (checkout, thank-you, OTP, order submission)
 *      MUST NEVER be cached.
 *   4. A page cached for one channel is never served for another channel's
 *      hostname.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import memoryCacheFactory from "astro/cache/memory";

const CONFIG_PATH = resolve(__dirname, "../../astro.config.mjs");

function readConfig(): string {
  return readFileSync(CONFIG_PATH, "utf8");
}

describe("astro edge cache configuration", () => {
  const config = readConfig();

  it("configures Astro 7 native cache provider", () => {
    expect(config).toContain("cache:");
    expect(config).toContain("provider: cacheProvider");
    expect(config).toContain("memoryCache(");
  });

  it("enforces SWR cache rules for high-traffic public catalog routes", () => {
    expect(config).toContain('"/": { maxAge: 60, swr: 3600, tags: ["home"] }');
    expect(config).toContain('"/products": { maxAge: 60, swr: 3600, tags: ["products"] }');
    expect(config).toContain('"/products/[slug]": { maxAge: 60, swr: 86400, tags: ["products"] }');
    expect(config).toContain('"/category/[slug]": { maxAge: 60, swr: 86400, tags: ["categories"] }');
    expect(config).toContain('"/lp/[slug]": { maxAge: 60, swr: 86400, tags: ["landing-pages"] }');
  });

  it("enforces long-lived cache for legal pages and immutable communes", () => {
    expect(config).toContain('"/pages/[slug]": { maxAge: 60, swr: 604800, tags: ["legal-pages"] }');
    expect(config).toContain('"/api/communes/[wilayaId]": { maxAge: 31536000, swr: 31536000, tags: ["communes"] }');
  });

  it("strictly excludes transactional surfaces from routeRules (never cache money/PII/OTP)", () => {
    const routeRulesMatch = config.match(/routeRules:\s*\{([^}]+)\}/s);
    expect(routeRulesMatch).not.toBeNull();
    const rules = routeRulesMatch![1];

    // Must never contain checkout, thank-you, or sensitive API routes
    expect(rules).not.toContain('"/checkout"');
    expect(rules).not.toContain('"/thank-you"');
    expect(rules).not.toContain('"/api/otp"');
    expect(rules).not.toContain('"/api/abandoned"');
    expect(rules).not.toContain('"/api/cart/validate"');
  });
});

describe("memory cache provider: one storefront, many channels", () => {
  const logger = { warn() {}, info() {}, error() {}, debug() {} };

  function render(host: string, path: string) {
    const provider = memoryCacheFactory(undefined);
    const call = (h: string) =>
      provider.onRequest!(
        { request: new Request(`http://${h}${path}`), logger } as never,
        async () =>
          new Response(`page of ${h}`, {
            headers: { "CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=3600" },
          }),
      );
    return { provider, call };
  }

  it("serves a cached page again to the same channel", async () => {
    const { call } = render("shop1.localhost", "/products");
    await call("shop1.localhost");
    const again = await call("shop1.localhost");
    expect(again.headers.get("X-Astro-Cache")).toBe("HIT");
    expect(await again.text()).toBe("page of shop1.localhost");
  });

  it("never serves one channel's cached page for another channel's hostname", async () => {
    const { call } = render("shop1.localhost", "/products");
    await call("shop1.localhost");
    const other = await call("shop2.localhost");
    expect(other.headers.get("X-Astro-Cache")).toBe("MISS");
    expect(await other.text()).toBe("page of shop2.localhost");
  });
});
