import type { Redis } from "@/platform/redis";

const LAST_USED_TTL_SECONDS = 60 * 24 * 3600;

const key = (userId: string, clientId: string, storeId: string) => `mcp:last-used:${userId}:${clientId}:${storeId}`;

export async function recordMcpLastUsed(redis: Redis | null, at: { userId: string; clientId: string; storeId: string }): Promise<void> {
  if (!redis) return;
  await redis.set(key(at.userId, at.clientId, at.storeId), new Date().toISOString(), { EX: LAST_USED_TTL_SECONDS }).catch(() => {});
}

export async function readMcpLastUsed(
  redis: Redis | null,
  entries: Array<{ userId: string; clientId: string; storeId: string }>,
): Promise<Array<string | null>> {
  if (!redis || entries.length === 0) return entries.map(() => null);
  try {
    return await redis.mGet(entries.map((e) => key(e.userId, e.clientId, e.storeId)));
  } catch {
    return entries.map(() => null);
  }
}

export async function forgetMcpLastUsed(redis: Redis | null, at: { userId: string; clientId: string; storeId: string }): Promise<void> {
  if (!redis) return;
  await redis.del(key(at.userId, at.clientId, at.storeId)).catch(() => {});
}
