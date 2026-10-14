import type { Context } from "hono";
import { sql } from "drizzle-orm";
import type { AppContext } from "@/types";
import { jsonBody } from "@/lib/route-builder";
import { ConflictError } from "@/lib/errors/classes";
import { resolveChannelTracking, type ChannelTracking } from "../../../../cod-shared/queries/tracking-config";
import type { ServerProvider } from "../../../../cod-shared/tracking/identifiers";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { SENDERS, type SendResult } from "@/tracking/senders";
import { CONVERSION_JOB } from "@/tracking/conversions";
import type { TestEventInput } from "./validation";

const READY: Record<ServerProvider, (t: ChannelTracking) => boolean> = {
  meta: (t) => Boolean(t.meta?.pixelId && t.meta.accessToken),
  tiktok: (t) => Boolean(t.tiktok?.accessToken),
  snap: (t) => Boolean(t.snap?.accessToken),
  ga4: (t) => Boolean(t.ga4?.apiSecret),
};

export async function sendTestEvent(c: Context<AppContext>) {
  const { provider } = jsonBody<TestEventInput>(c);
  const db = c.get("db");
  const tracking = await resolveChannelTracking(db, { storeId: c.get("storeId")! });
  if (!tracking || !READY[provider](tracking)) {
    throw new ConflictError("Save this provider's id and access token first", ERROR_CODES.TRACKING_NOT_CONFIGURED, { provider });
  }
  const store = await db.execute<{ domain: string | null }>(sql`select domain from stores where id = ${c.get("storeId")!}`);
  const domain = store.rows[0]?.domain;
  let result: SendResult;
  try {
    result = await SENDERS[provider](
      tracking,
      {
        eventName: "Purchase",
        eventId: `test-${crypto.randomUUID()}`,
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: domain ? `https://${domain}/thank-you` : null,
        value: 1000,
        currency: "DZD",
        contentIds: ["test-product"],
        user: {
          phone: "0550000000",
          ip: c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? null,
          userAgent: c.req.header("User-Agent") ?? null,
        },
      },
      { test: true },
    );
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  return c.json({ success: true, data: { provider, ok: result.success, message: result.error ?? null, reference: result.reference ?? null } }, 200);
}

export async function listEvents(c: Context<AppContext>) {
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const { rows } = await c.get("db").execute<Record<string, unknown>>(sql`
    select j.id, j.payload->>'provider' as provider, j.payload->>'eventName' as "eventName",
           j.payload->>'stage' as stage, j.status, j.attempts, j.last_error as "lastError",
           j.result, j.created_at as "createdAt", j.finished_at as "finishedAt", j.run_at as "nextAttemptAt",
           o.id as "orderId", o.order_number as "orderNumber"
      from jobs j
      left join orders o on o.id = j.payload->>'orderId'
     where j.kind = ${CONVERSION_JOB}
     order by j.created_at desc
     limit ${limit}`);
  return c.json({ success: true, data: rows }, 200);
}
