import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type pg from "pg";
import { createPool } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { purgeChannelPages } from "./storefront-cache";

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
    await purgeChannelPages(env(), "purge-a", fetcher as never);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://storefront:4321/api/channel-cache");
    expect((init.headers as Record<string, string>)["X-Storefront-Key"]).toBe("key");
    expect(JSON.parse(init.body as string).hostnames.sort()).toEqual(["boutique-a.dz", "purge-a.codflow.test"]);
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
