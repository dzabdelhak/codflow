import type pg from "pg";
import { recognised, type DestinationAnswer, type OrderDestination } from "./destination";

export interface OutboundOptions {
  senders: number;
  timeoutMs: number;
  maxDelayMs: number;
  holdAttempts: number;
}

export const OUTBOUND_DEFAULTS: OutboundOptions = { senders: 4, timeoutMs: 30_000, maxDelayMs: 60 * 60 * 1000, holdAttempts: 5 };

export function outboundOptionsFromEnv(env: Record<string, string | undefined>): OutboundOptions {
  const positive = (raw: string | undefined, fallback: number) => {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return {
    senders: positive(env.OUTBOUND_SENDERS, OUTBOUND_DEFAULTS.senders),
    timeoutMs: positive(env.OUTBOUND_SEND_TIMEOUT_MS, OUTBOUND_DEFAULTS.timeoutMs),
    maxDelayMs: positive(env.OUTBOUND_MAX_DELAY_MS, OUTBOUND_DEFAULTS.maxDelayMs),
    holdAttempts: positive(env.OUTBOUND_HOLD_ATTEMPTS, OUTBOUND_DEFAULTS.holdAttempts),
  };
}

export function outboundDelayMs(attempts: number, maxDelayMs = OUTBOUND_DEFAULTS.maxDelayMs): number {
  return Math.min(15_000 * 2 ** Math.max(0, attempts - 1), maxDelayMs);
}

function log(event: string, fields: Record<string, unknown>) {
  console.warn(JSON.stringify({ event, ...fields }));
}

const CLAIM = `
  with last_success as (
    select coalesce(max(sent_at), '-infinity'::timestamptz) as at from outbound_orders where status = 'sent'
  ),
  candidates as (
    select head.id from stores s cross join last_success ls
    cross join lateral (select not exists (
      select 1 from channel_aventy_keys k where k.store_id = s.id and k.status = 'revoked') as open) gate
    cross join lateral (
      select o.id from outbound_orders o
       where o.store_id = s.id and o.status = 'pending'
         and not (o.attempts >= $1 and o.last_attempt_at < ls.at)
       order by o.created_at, o.id
       limit 1) head
     where gate.open
    union all
    select poison.id from stores s cross join last_success ls
    cross join lateral (select not exists (
      select 1 from channel_aventy_keys k where k.store_id = s.id and k.status = 'revoked') as open) gate
    cross join lateral (
      select o.id from outbound_orders o
       where o.store_id = s.id and o.status = 'pending' and o.attempts > 0
         and o.attempts >= $1 and o.last_attempt_at < ls.at and o.next_attempt_at <= now()
       order by o.created_at, o.id
       limit 1) poison
     where gate.open
  )
  select o.id, o.store_id as "storeId", o.payload, o.attempts
    from outbound_orders o
   where o.id in (select id from candidates) and o.status = 'pending' and o.next_attempt_at <= now()
   order by o.next_attempt_at, o.id
   limit 1
   for update of o skip locked`;

export type SendResult = { sendId: string; outcome: DestinationAnswer["kind"] | "error" } | null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function sendNextOutbound(
  platform: pg.Pool,
  destination: OrderDestination,
  options: Partial<OutboundOptions> = {},
): Promise<SendResult> {
  const { timeoutMs, maxDelayMs, holdAttempts } = { ...OUTBOUND_DEFAULTS, ...options };
  const client = await platform.connect();
  let released = false;
  try {
    await client.query("begin");
    const { rows: [entry] } = await client.query<{ id: string; storeId: string; payload: unknown; attempts: number }>(CLAIM, [holdAttempts]);
    if (!entry) {
      await client.query("commit");
      return null;
    }
    let answer: DestinationAnswer | { kind: "error"; detail: string };
    try {
      answer = recognised(await withTimeout(destination.send({ sendId: entry.id, storeId: entry.storeId, payload: entry.payload }), timeoutMs));
    } catch (err) {
      answer = { kind: "error", detail: err instanceof Error ? err.message : String(err) };
    }
    const attempts = entry.attempts + 1;
    switch (answer.kind) {
      case "accepted":
      case "duplicate":
      case "review":
        await client.query(
          `update outbound_orders
              set status = 'sent', attempts = $2, aventy_order_id = $3, sent_at = now(), last_attempt_at = now(),
                  last_outcome = $4, outcome_detail = $5, last_error = null
            where id = $1`,
          [entry.id, attempts, answer.remoteId, answer.kind, answer.kind === "review" ? { reasons: answer.reasons } : null],
        );
        break;
      case "rejected":
        await client.query(
          `update outbound_orders
              set status = 'rejected', attempts = $2, last_attempt_at = now(), last_outcome = 'rejected',
                  outcome_detail = $3, last_error = $4
            where id = $1`,
          [entry.id, attempts, { fields: answer.fields }, answer.message.slice(0, 500)],
        );
        log("outbound.rejected", { sendId: entry.id, storeId: entry.storeId, fields: answer.fields });
        break;
      case "unauthorized":
        await client.query(
          `update outbound_orders
              set last_attempt_at = now(), last_outcome = 'unauthorized', outcome_detail = null, last_error = $2,
                  next_attempt_at = now() + interval '10 minutes'
            where id = $1`,
          [entry.id, answer.reason.slice(0, 500)],
        );
        log("outbound.unauthorized", { sendId: entry.id, storeId: entry.storeId });
        break;
      default: {
        const detail = answer.kind === "retry" ? answer.reason : answer.detail;
        await client.query(
          `update outbound_orders
              set attempts = $2, last_attempt_at = now(), last_outcome = $3, outcome_detail = null, last_error = $4,
                  next_attempt_at = now() + make_interval(secs => $5::double precision / 1000)
            where id = $1`,
          [entry.id, attempts, answer.kind, detail.slice(0, 500), outboundDelayMs(attempts, maxDelayMs)],
        );
        if (answer.kind === "unknown") log("outbound.unknown_answer", { sendId: entry.id, storeId: entry.storeId, attempts });
      }
    }
    await client.query("commit");
    return { sendId: entry.id, outcome: answer.kind };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    client.release(err as Error);
    released = true;
    throw err;
  } finally {
    if (!released) client.release();
  }
}

export async function drainOutbound(
  platform: pg.Pool,
  destination: OrderDestination,
  options: Partial<OutboundOptions> = {},
  max = 500,
): Promise<number> {
  let sent = 0;
  while (sent < max && (await sendNextOutbound(platform, destination, options))) sent++;
  return sent;
}

export async function raiseOutboundAlerts(platform: pg.Pool): Promise<number> {
  const { rows } = await platform.query<{ id: string; storeId: string; ageHours: number; attempts: number; lastOutcome: string | null }>(
    `update outbound_orders
        set alerted_at = now()
      where status = 'pending' and queued_at < now() - interval '24 hours' and alerted_at is null
      returning id, store_id as "storeId", floor(extract(epoch from now() - queued_at) / 3600)::int as "ageHours",
                attempts, last_outcome as "lastOutcome"`,
  );
  for (const row of rows) log("outbound.stale", { sendId: row.id, storeId: row.storeId, ageHours: row.ageHours, attempts: row.attempts, lastOutcome: row.lastOutcome });
  return rows.length;
}

export function startOutboundWorker(
  platform: pg.Pool,
  destination: OrderDestination,
  { intervalMs = 2000, alertEveryMs = 10 * 60 * 1000, ...options }: Partial<OutboundOptions> & { intervalMs?: number; alertEveryMs?: number } = {},
): () => void {
  const busy = new Array<boolean>(options.senders ?? OUTBOUND_DEFAULTS.senders).fill(false);
  const tick = () => {
    busy.forEach((running, slot) => {
      if (running) return;
      busy[slot] = true;
      drainOutbound(platform, destination, options)
        .catch((err) => console.error("[outbound] worker failed:", err instanceof Error ? err.message : err))
        .finally(() => (busy[slot] = false));
    });
  };
  const alerts = () => void raiseOutboundAlerts(platform).catch((err) => console.error("[outbound] alert check failed:", err instanceof Error ? err.message : err));
  const timer = setInterval(tick, intervalMs);
  const alertTimer = setInterval(alerts, alertEveryMs);
  timer.unref();
  alertTimer.unref();
  tick();
  alerts();
  return () => {
    clearInterval(timer);
    clearInterval(alertTimer);
  };
}
