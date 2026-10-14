import { randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { first, type AppDb } from "../../../../cod-shared/db/client";
import { blockedOrderAttempts, blockedPhones, orders, type BlockedOrderReason } from "../../../../cod-shared/db/schema";

export const DEFAULT_IP_CEILING_PER_HOUR = 20;

export function ipCeilingPerHour(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_IP_CEILING_PER_HOUR;
}

export interface FloodCheck {
  phone: string;
  deviceId: string | null;
  ip: string | null;
  windowMinutes: number;
  ipCeiling: number;
  now?: Date;
}

async function lock(db: AppDb, key: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(current_setting('app.store_id') || ${key}, 0))`);
}

export async function orderFloodVerdict(db: AppDb, check: FloodCheck): Promise<BlockedOrderReason | null> {
  const now = check.now ?? new Date();
  await lock(db, `:order-phone:${check.phone}`);
  if (check.deviceId) await lock(db, `:order-device:${check.deviceId}`);

  const blocked = await db.select({ id: blockedPhones.id }).from(blockedPhones).where(eq(blockedPhones.phone, check.phone)).limit(1).then(first);
  if (blocked) return "blocked_phone";

  if (check.windowMinutes > 0) {
    const since = new Date(now.getTime() - check.windowMinutes * 60_000).toISOString();
    const byPhone = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.phone, check.phone), gt(orders.createdAt, since))).limit(1).then(first);
    if (byPhone) return "phone_window";
    if (check.deviceId) {
      const byDevice = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.deviceId, check.deviceId), gt(orders.createdAt, since))).limit(1).then(first);
      if (byDevice) return "device_window";
    }
  }

  if (check.ip) {
    const since = new Date(now.getTime() - 60 * 60_000).toISOString();
    const [{ n }] = await db.select({ n: count() }).from(orders).where(and(eq(orders.ipAddress, check.ip), gt(orders.createdAt, since)));
    if (n >= check.ipCeiling) return "ip_ceiling";
  }
  return null;
}

export async function recordBlockedAttempt(
  db: AppDb,
  attempt: {
    reason: BlockedOrderReason;
    orderNumber: string;
    phone: string;
    customerName: string;
    deviceId: string | null;
    ip: string | null;
    lines: Array<{ productName: string; quantity: number }>;
    total: number | null;
  },
): Promise<void> {
  await db.insert(blockedOrderAttempts).values({
    id: randomUUID(),
    reason: attempt.reason,
    orderNumber: attempt.orderNumber,
    phone: attempt.phone,
    customerName: attempt.customerName,
    deviceId: attempt.deviceId,
    ipAddress: attempt.ip,
    details: { lines: attempt.lines, total: attempt.total },
  });
}
