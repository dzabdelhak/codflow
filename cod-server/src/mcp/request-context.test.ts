/**
 * readClientMeta + checkMcpRateLimit — the per-request client-context reader
 * and the coarse, fail-open Redis rate guard.
 *
 * Contract:
 *   • readClientMeta extracts ONLY the two documented string hints, tolerating
 *     any malformed context shape
 *   • the rate limit is fail-open: no Redis or a Redis error allows the call — scope gating and the audit trail are the security
 *     boundary, this guard only stops sustained flooding
 *   • over the limit → blocked with a bounded retry hint
 */

import { describe, it, expect, vi } from "vitest";
import type { Redis } from "@/platform/redis";
import {
  readClientMeta,
  checkMcpRateLimit,
  RATE_LIMIT_MAX_CALLS,
  RATE_LIMIT_WINDOW_SECONDS,
} from "./request-context";

function ctxWithMeta(meta: Record<string, unknown> | undefined) {
  return meta === undefined ? {} : { mcpReq: { _meta: meta } };
}

describe("readClientMeta", () => {
  it("extracts subject and session hints", () => {
    expect(
      readClientMeta(ctxWithMeta({ "openai/subject": "sub-1", "openai/session": "sess-2" })),
    ).toEqual({ subject: "sub-1", session: "sess-2" });
  });

  it("ignores non-string values and unrelated keys", () => {
    expect(
      readClientMeta(
        ctxWithMeta({
          "openai/subject": 42,
          "openai/session": null,
          "openai/userAgent": "Mozilla/5.0",
          "openai/userLocation": { city: "Algiers" },
        }),
      ),
    ).toEqual({});
  });

  it("tolerates missing ctx, missing mcpReq, and missing _meta", () => {
    expect(readClientMeta(undefined)).toEqual({});
    expect(readClientMeta({})).toEqual({});
    expect(readClientMeta({ mcpReq: {} })).toEqual({});
    expect(readClientMeta({ mcpReq: { _meta: undefined } })).toEqual({});
  });

  it("returns partial hints when only one is present", () => {
    expect(readClientMeta(ctxWithMeta({ "openai/session": "s" }))).toEqual({ session: "s" });
  });
});

function makeRedis(counters = new Map<string, number>(), fail = false): Redis {
  return {
    incr: vi.fn(async (key: string) => {
      if (fail) throw new Error("Redis down");
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  } as unknown as Redis;
}

describe("checkMcpRateLimit", () => {
  it("allows everything when Redis is not configured", async () => {
    expect(await checkMcpRateLimit(null, "user-1")).toEqual({ allowed: true });
  });

  it("counts up within the window, expiring the counter, and allows calls under the limit", async () => {
    const redis = makeRedis();
    for (let i = 0; i < 3; i++) expect(await checkMcpRateLimit(redis, "user-1")).toEqual({ allowed: true });
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(vi.mocked(redis.expire).mock.calls[0]).toEqual([expect.stringMatching(/^mcp:rl:user-1:\d+$/), RATE_LIMIT_WINDOW_SECONDS * 2]);
  });

  it("lets the last call under the limit through and blocks the next with a bounded retry hint", async () => {
    const redis = makeRedis();
    for (let i = 0; i < RATE_LIMIT_MAX_CALLS; i++) expect((await checkMcpRateLimit(redis, "user-1")).allowed).toBe(true);
    const result = await checkMcpRateLimit(redis, "user-1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_SECONDS);
    }
  });

  it("fails OPEN on a Redis error", async () => {
    expect(await checkMcpRateLimit(makeRedis(new Map(), true), "user-1")).toEqual({ allowed: true });
  });

  it("isolates subjects into separate counters", async () => {
    const counters = new Map<string, number>();
    const redis = makeRedis(counters);
    for (let i = 0; i < RATE_LIMIT_MAX_CALLS; i++) await checkMcpRateLimit(redis, "alice");
    expect((await checkMcpRateLimit(redis, "alice")).allowed).toBe(false);
    expect((await checkMcpRateLimit(redis, "bob")).allowed).toBe(true);
  });
});
