import { describe, it, expect } from "vitest";
import { withRequestHost, currentRequestHost, memoForRequest } from "./request-host";

describe("request host context", () => {
  it("exposes the host of the request being rendered", async () => {
    const seen = await withRequestHost("shop1.localhost:8090", async () => currentRequestHost());
    expect(seen).toBe("shop1.localhost:8090");
  });

  it("keeps concurrent requests apart", async () => {
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const [a, b] = await Promise.all([
      withRequestHost("shop1.localhost", async () => (await tick(), currentRequestHost())),
      withRequestHost("shop2.localhost", async () => (await tick(), currentRequestHost())),
    ]);
    expect([a, b]).toEqual(["shop1.localhost", "shop2.localhost"]);
  });

  it("has no host outside a request", () => {
    expect(currentRequestHost()).toBeUndefined();
  });
});

describe("per-request memo", () => {
  it("computes a value once per request and shares it", async () => {
    let calls = 0;
    const load = () => memoForRequest("config", async () => ++calls);
    const [a, b] = await withRequestHost("shop1.localhost", async () => [await load(), await load()]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
  });

  it("never shares a value between two requests", async () => {
    let calls = 0;
    const load = () => memoForRequest("config", async () => ++calls);
    const a = await withRequestHost("shop1.localhost", load);
    const b = await withRequestHost("shop2.localhost", load);
    expect([a, b]).toEqual([1, 2]);
  });

  it("computes without caching outside a request", async () => {
    let calls = 0;
    const load = () => memoForRequest("config", async () => ++calls);
    await load();
    await load();
    expect(calls).toBe(2);
  });
});
