import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type pg from "pg";
import { createPool } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { purgeChannelPages, purgeProductChannels, storefrontInstances } from "./storefront-cache";

let harness: TestDb;
let platform: pg.Pool;

beforeAll(async () => {
  harness = await createTestDb();
  platform = createPool(harness.url, "codflow_platform");
  await harness.createStore("purge-a", ["purge-a.codflow.test", "boutique-a.dz"]);
}, 120_000);

afterAll(async () => {
  await platform?.end();
  await harness?.dispose();
});

const env = (overrides: Record<string, string | undefined> = {}) =>
  ({
    DATABASE: { platform },
    STOREFRONT_INTERNAL_URL: "http://storefront:4321",
    STOREFRONT_SERVICE_KEY: "key",
    ...overrides,
  }) as never;

describe("purgeChannelPages", () => {
  it("asks the storefront to drop every cached page of the store's hostnames", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await purgeChannelPages(env({ STOREFRONT_INTERNAL_URL: "http://10.0.0.7:4321" }), "purge-a", fetcher as never);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://10.0.0.7:4321/api/channel-cache");
    expect((init.headers as Record<string, string>)["X-Storefront-Key"]).toBe("key");
    expect(JSON.parse(init.body as string).hostnames.sort()).toEqual(["boutique-a.dz", "purge-a.codflow.test"]);
  });

  it("reaches every running storefront, so no replica keeps serving a stale page", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await purgeChannelPages(env(), "purge-a", fetcher as never, async () => ["172.18.0.5", "172.18.0.6"]);
    expect(fetcher.mock.calls.map((call) => String((call as unknown as [URL])[0])).sort()).toEqual([
      "http://172.18.0.5:4321/api/channel-cache",
      "http://172.18.0.6:4321/api/channel-cache",
    ]);
  });

  it("never fails the status change when the storefront is unreachable", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(purgeChannelPages(env(), "purge-a", fetcher as never)).resolves.toBeUndefined();
  });

  it("does nothing when no storefront is configured", async () => {
    const fetcher = vi.fn();
    await purgeChannelPages(env({ STOREFRONT_INTERNAL_URL: undefined }), "purge-a", fetcher as never);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("storefrontInstances", () => {
  it("expands each configured storefront to every address its name resolves to", async () => {
    const resolve = async (host: string) => (host === "storefront" ? ["172.18.0.5", "fd00::6"] : []);
    const instances = await storefrontInstances("http://storefront:4321, http://10.0.0.9:4321", resolve);
    expect(instances.map(String)).toEqual(["http://172.18.0.5:4321/", "http://[fd00::6]:4321/", "http://10.0.0.9:4321/"]);
    expect((await storefrontInstances("http://unresolvable:4321", resolve)).map(String)).toEqual(["http://unresolvable:4321/"]);
  });
});

describe("purgeProductChannels", () => {
  it("drops the cached pages of every channel carrying the product, whichever store is active", async () => {
    await harness.createStore("purge-landing", ["purge-landing.codflow.test"]);
    await harness.createStore("purge-other", ["purge-other.codflow.test"]);
    await harness.platform.query(
      `insert into products (id, merchant_id, name, handle, price, created_at, updated_at)
       values ('purge-p', (select merchant_id from stores where id = 'purge-a'), 'P', 'purge-p', 100, '', '')`,
    );
    await harness.platform.query(
      `insert into channel_products (store_id, product_id, created_at, updated_at)
       values ('purge-a', 'purge-p', '', ''), ('purge-landing', 'purge-p', '', '')`,
    );
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await purgeProductChannels(env(), "purge-p", fetcher as never);

    const hostnames = (fetcher.mock.calls as unknown as Array<[URL, RequestInit]>).flatMap(
      ([, init]) => JSON.parse(init.body as string).hostnames as string[],
    );
    expect(hostnames.sort()).toEqual(["boutique-a.dz", "purge-a.codflow.test", "purge-landing.codflow.test"]);
  });
});
