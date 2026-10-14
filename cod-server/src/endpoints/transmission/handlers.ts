import type { Context } from "hono";
import { sql } from "drizzle-orm";
import type { AppContext } from "@/types";
import { ConflictError, NotFoundError } from "@/lib/errors/classes";
import { ACTIONS, logActivity } from "@/lib/activity";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { destinationFromEnv } from "@/platform/outbound/destination";

const FAILING = ["retry", "unknown", "error"];

const ENTRY_COLUMNS = sql`o.id as "sendId", o.order_id as "orderId", ord.order_number as "orderNumber", o.status, o.attempts,
  o.created_at as "createdAt", o.next_attempt_at as "nextAttemptAt", o.last_attempt_at as "lastAttemptAt",
  o.last_outcome as "lastOutcome", o.outcome_detail as "outcomeDetail", o.last_error as "lastError",
  o.sent_at as "sentAt", o.aventy_order_id as "remoteId"`;

export async function getTransmission(c: Context<AppContext>) {
  const db = c.get("db");
  const [summary, waiting, rejected, errors] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select count(*) filter (where status = 'pending')::int as waiting,
             count(*) filter (where status = 'sent')::int as sent,
             count(*) filter (where status = 'rejected')::int as rejected,
             count(*) filter (where status = 'pending' and queued_at < now() - interval '24 hours')::int as stale,
             min(created_at) filter (where status = 'pending') as "oldestWaitingAt",
             max(sent_at) as "lastSuccessAt",
             (select last_outcome from outbound_orders where last_attempt_at is not null order by last_attempt_at desc limit 1) as "lastOutcome",
             max(last_attempt_at) as "lastAttemptAt"
        from outbound_orders`),
    db.execute(sql`select ${ENTRY_COLUMNS} from outbound_orders o join orders ord on ord.id = o.order_id
                    where o.status = 'pending' order by o.created_at, o.id limit 50`),
    db.execute(sql`select ${ENTRY_COLUMNS} from outbound_orders o join orders ord on ord.id = o.order_id
                    where o.status = 'rejected' order by o.last_attempt_at desc nulls last limit 50`),
    db.execute(sql`select ${ENTRY_COLUMNS} from outbound_orders o join orders ord on ord.id = o.order_id
                    where o.last_outcome in ('retry', 'unknown', 'error', 'rejected') order by o.last_attempt_at desc limit 10`),
  ]);
  const s = summary.rows[0] as { lastOutcome: string | null } & Record<string, unknown>;
  const state = !s.lastOutcome ? "idle" : FAILING.includes(s.lastOutcome) ? "failing" : "connected";
  return c.json(
    {
      success: true,
      data: {
        destination: destinationFromEnv(c.env).name,
        connection: { state, lastAttemptAt: s.lastAttemptAt, lastOutcome: s.lastOutcome },
        lastSuccessAt: s.lastSuccessAt,
        counts: { waiting: s.waiting, sent: s.sent, rejected: s.rejected, stale: s.stale },
        oldestWaitingAt: s.oldestWaitingAt,
        waiting: waiting.rows,
        rejected: rejected.rows,
        recentErrors: errors.rows,
      },
    },
    200,
  );
}

export async function getTransmissionAlerts(c: Context<AppContext>) {
  const { rows } = await c.get("db").execute<{ stale: number; rejected: number }>(sql`
    select count(*) filter (where status = 'pending' and queued_at < now() - interval '24 hours')::int as stale,
           count(*) filter (where status = 'rejected')::int as rejected
      from outbound_orders`);
  return c.json({ success: true, data: rows[0] }, 200);
}

export async function resendRejected(c: Context<AppContext>) {
  const sendId = c.req.param("sendId")!;
  const db = c.get("db");
  const { rows } = await db.execute<{ status: string; orderId: string; orderNumber: string }>(sql`
    select o.status, o.order_id as "orderId", ord.order_number as "orderNumber"
      from outbound_orders o join orders ord on ord.id = o.order_id where o.id = ${sendId} for update of o`);
  const entry = rows[0];
  if (!entry) throw new NotFoundError("Outbound order", sendId);
  if (entry.status !== "rejected") {
    throw new ConflictError("Only a rejected order can be resent", ERROR_CODES.OUTBOUND_NOT_REJECTED, { status: entry.status });
  }
  await db.execute(sql`
    update outbound_orders o
       set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, alerted_at = null, queued_at = now(),
           payload = o.payload || jsonb_build_object(
             'customer', jsonb_build_object(
               'name', ord.customer_name, 'phone', ord.phone, 'wilayaId', ord.wilaya_id,
               'communeId', ord.commune_id, 'address', ord.address),
             'delivery', jsonb_build_object(
               'type', ord.delivery_type,
               'office', case when ord.delivery_type = 'home' then null else o.payload->'delivery'->'office' end,
               'fee', case when ord.delivery_fee_to_confirm then null else ord.delivery_fee end,
               'gridVersion', ord.delivery_grid_version,
               'feeToConfirm', ord.delivery_fee_to_confirm))
      from orders ord
     where o.id = ${sendId} and ord.id = o.order_id`);
  await logActivity(db, c.get("user"), ACTIONS.ORDER_TRANSMISSION_RESENT, { type: "order", id: entry.orderId, label: entry.orderNumber });
  return getTransmission(c);
}
