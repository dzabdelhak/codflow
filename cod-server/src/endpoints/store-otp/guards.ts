/**
 * Storefront OTP — send guards (cost control)
 *
 * Redis-backed cooldowns that stop runaway sends BEFORE they cost the merchant
 * 5 DA each. Best-effort by contract: without Redis, or on a Redis error, the
 * send proceeds — dzverify's own limits (5/recipient/hour, 200/account/hour)
 * remain the hard bound. The HMAC token is the security boundary.
 */
import type { Redis } from "@/platform/redis";

const PHONE_COOLDOWN_SECONDS = 60;
const IP_HOURLY_LIMIT = 20;
const IP_WINDOW_SECONDS = 3600;

const cooldownKey = (storeId: string, phone: string) => `otp:cd:${storeId}:${phone}`;
const ipKey = (storeId: string, ip: string) => `otp:ip:${storeId}:${ip}`;

export async function trippedOtpGuard(
  redis: Redis | null,
  storeId: string,
  phone: string,
  ip: string | null,
): Promise<{ reason: string; windowSeconds: number } | null> {
  if (!redis) return null;
  try {
    const remaining = await redis.ttl(cooldownKey(storeId, phone));
    if (remaining > 0) return { reason: "phone_cooldown", windowSeconds: remaining };
    if (ip && Number((await redis.get(ipKey(storeId, ip))) ?? 0) >= IP_HOURLY_LIMIT) {
      return { reason: "ip_hourly", windowSeconds: IP_WINDOW_SECONDS };
    }
    return null;
  } catch {
    return null;
  }
}

export async function recordOtpSend(redis: Redis | null, storeId: string, phone: string, ip: string | null): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(cooldownKey(storeId, phone), "1", { EX: PHONE_COOLDOWN_SECONDS });
    if (ip && (await redis.incr(ipKey(storeId, ip))) === 1) await redis.expire(ipKey(storeId, ip), IP_WINDOW_SECONDS);
  } catch {
    // Cost-control bookkeeping only — never block the send path.
  }
}
