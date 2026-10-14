import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type pg from "pg";
import type { AppDb } from "../../../../cod-shared/db/client";
import { blockedOrderAttempts, type BlockedOrderReason } from "../../../../cod-shared/db/schema";
import { allocateOrderNumber } from "../../../../cod-shared/queries/order-numbers";

export const DEFAULT_IP_CEILING_PER_HOUR = 20;
export const IP_HARD_CEILING_FACTOR = 3;
export const ATTEMPT_LOG_CAP_PER_10_MINUTES = 100;

export function ipCeilingPerHour(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_IP_CEILING_PER_HOUR;
}

export interface FloodCheck {
  phone: string;
  deviceId: string | null;
  ip: string | null;
  ipCeiling: number;
}

export type FloodVerdict = { action: "drop"; reason: BlockedOrderReason } | { action: "flag"; reason: "ip_flagged" } | null;

async function lock(db: AppDb, key: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(current_setting('app.store_id') || ${key}, 0))`);
}

export async function orderFloodVerdict(db: AppDb, check: FloodCheck): Promise<FloodVerdict> {
  await lock(db, `:order-phone:${check.phone}`);
  if (check.deviceId) await lock(db, `:order-device:${check.deviceId}`);

  const { rows } = await db.execute<{ blockedPhone: boolean; phoneRecent: boolean; deviceRecent: boolean; ipOrders: number }>(sql`
    with cutoff as (
      select w,
             to_char((now() - make_interval(mins => w)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as since,
             to_char((now() - interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as hour_ago
        from (select coalesce((select order_limit_minutes from "stores" where id = current_setting('app.store_id')), 10) as w) s
    )
    select
      exists (select 1 from blocked_phones where phone = ${check.phone}) as "blockedPhone",
      cutoff.w > 0 and exists (
        select 1 from orders o where o.phone = ${check.phone} and o.status <> 'cancelled' and o.created_at > cutoff.since
      ) as "phoneRecent",
      cutoff.w > 0 and ${check.deviceId}::text is not null and exists (
        select 1 from orders o where o.device_id = ${check.deviceId} and o.status <> 'cancelled' and o.created_at > cutoff.since
      ) as "deviceRecent",
      case when ${check.ip}::text is null then 0 else (
        select count(*) from orders o
         where o.created_at > cutoff.hour_ago
           and case when pg_input_is_valid(o.ip_address, 'inet') then
                 case when family(o.ip_address::inet) = family(${check.ip}::inet) then
                   network(set_masklen(o.ip_address::inet, case when family(${check.ip}::inet) = 6 then 64 else 32 end))
                     = network(set_masklen(${check.ip}::inet, case when family(${check.ip}::inet) = 6 then 64 else 32 end))
                 else false end
               else false end
      ) end as "ipOrders"
    from cutoff`);
  const r = rows[0];
  if (r.blockedPhone) return { action: "drop", reason: "blocked_phone" };
  if (r.phoneRecent) return { action: "drop", reason: "phone_window" };
  if (r.deviceRecent) return { action: "drop", reason: "device_window" };
  if (r.ipOrders >= check.ipCeiling * IP_HARD_CEILING_FACTOR) return { action: "drop", reason: "ip_ceiling" };
  if (r.ipOrders >= check.ipCeiling) return { action: "flag", reason: "ip_flagged" };
  return null;
}

export interface AttemptRecord {
  reason: BlockedOrderReason;
  orderNumber: string;
  phone: string;
  customerName: string;
  deviceId: string | null;
  ip: string | null;
  lines: Array<{ productName: string; quantity: number }>;
  total: number | null;
}

export async function underLogCap(db: AppDb): Promise<boolean> {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from blocked_order_attempts where created_at > now() - interval '10 minutes'`,
  );
  return rows[0].n < ATTEMPT_LOG_CAP_PER_10_MINUTES;
}

export async function recordAttempt(db: AppDb, attempt: AttemptRecord): Promise<void> {
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

export async function blockedOrderNumber(db: AppDb): Promise<{ orderNumber: string; logged: boolean }> {
  if (await underLogCap(db)) return { orderNumber: await allocateOrderNumber(db), logged: true };
  const { rows } = await db.execute<{ prefix: string; seq: number }>(
    sql`select order_prefix as prefix, order_seq as seq from "stores" where id = current_setting('app.store_id')`,
  );
  return { orderNumber: `${rows[0].prefix}-${String(rows[0].seq + 1).padStart(5, "0")}`, logged: false };
}

export async function pruneBlockedAttempts(platform: pg.Pool, olderThanDays = 90): Promise<number> {
  const { rowCount } = await platform.query(
    "delete from blocked_order_attempts where created_at < now() - make_interval(days => $1)",
    [olderThanDays],
  );
  return rowCount ?? 0;
}
