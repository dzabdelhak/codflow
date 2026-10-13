/**
 * better-auth secondary storage on Redis (sessions cache, rate limits).
 * `increment` is required by better-auth's rate limiter.
 */
import type { createClient } from "redis";

type Redis = ReturnType<typeof createClient>;

export function redisSecondaryStorage(redis: () => Promise<Redis>) {
  return {
    get: async (key: string) => (await redis()).get(key),
    getAndDelete: async (key: string) => (await redis()).getDel(key),
    set: async (key: string, value: string, ttl?: number) => {
      const client = await redis();
      if (ttl) await client.set(key, value, { expiration: { type: "EX", value: Math.max(1, Math.ceil(ttl)) } });
      else await client.set(key, value);
    },
    delete: async (key: string) => {
      await (await redis()).del(key);
    },
    increment: async (key: string, ttl?: number): Promise<number> => {
      const client = await redis();
      const next = await client.incr(key);
      if (next === 1) await client.expire(key, Math.max(1, Math.ceil(ttl ?? 60)));
      return next;
    },
  };
}
