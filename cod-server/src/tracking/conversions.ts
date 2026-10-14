import type pg from "pg";
import { and, eq } from "drizzle-orm";
import { first, getDb, type AppDb } from "../../../cod-shared/db/client";
import { capiEventLog, communes, landingPages, orderProducts, orders, stores } from "@/db/schema";
import { resolveChannelTracking, type ChannelTracking } from "../../../cod-shared/queries/tracking-config";
import type { ServerProvider } from "../../../cod-shared/tracking/identifiers";
import { enqueueJob, PermanentJobError, recordSkippedJob, type JobHandler } from "@/platform/jobs";
import {
  conversionSourceUrl,
  resolveConversionForStage,
  shouldTriggerCapiConfirmed,
  shouldTriggerCapiPurchase,
  type ConversionStage,
  type MetaEventName,
} from "./capi-helpers";
import { SENDERS, type ServerConversion } from "./senders";

export const CONVERSION_JOB = "conversion";
const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;

export interface ConversionJobPayload {
  orderId: string;
  provider: ServerProvider;
  eventName: MetaEventName;
  stage: ConversionStage;
  triggeredAt: number;
  eventSourceUrl: string | null;
}

export function conversionStageFor(status: string, wilayaId: number | null | undefined): ConversionStage | null {
  if (shouldTriggerCapiConfirmed(status)) return "confirmed";
  if (shouldTriggerCapiPurchase(status, wilayaId)) return "delivered";
  return null;
}

type PlannedConversion = { provider: ServerProvider; eventName: MetaEventName };

function conversionPlan(
  tracking: ChannelTracking | null,
  stage: ConversionStage,
  consent: boolean | null,
): { sends: PlannedConversion[]; withoutCredentials: PlannedConversion[] } {
  const plan = { sends: [] as PlannedConversion[], withoutCredentials: [] as PlannedConversion[] };
  if (!tracking?.enabled) return plan;
  if (tracking.consentRequired && consent !== true) return plan;
  const consider = (provider: ServerProvider, configured: boolean, ready: boolean, mode = tracking.conversionEvent) => {
    if (!configured) return;
    const decision = resolveConversionForStage(mode, stage);
    if (!decision.shouldFire || !decision.eventName) return;
    (ready ? plan.sends : plan.withoutCredentials).push({ provider, eventName: decision.eventName });
  };
  consider("meta", Boolean(tracking.meta), Boolean(tracking.meta?.accessToken), tracking.meta?.conversionEvent);
  consider("tiktok", Boolean(tracking.tiktok), Boolean(tracking.tiktok?.accessToken));
  consider("snap", Boolean(tracking.snap), Boolean(tracking.snap?.accessToken));
  consider("ga4", Boolean(tracking.ga4), Boolean(tracking.ga4?.apiSecret));
  return plan;
}

export function serverConversions(
  tracking: ChannelTracking | null,
  stage: ConversionStage,
  consent: boolean | null,
): PlannedConversion[] {
  return conversionPlan(tracking, stage, consent).sends;
}

export const conversionDedupKey = (provider: ServerProvider, orderId: string, eventName: MetaEventName) =>
  `conversion:${provider}:${orderId}:${eventName}`;

export async function enqueueConversions(
  db: AppDb,
  { orderId, stage, refererUrl }: { orderId: string; stage: ConversionStage; refererUrl?: string | null },
): Promise<number> {
  const order = await db
    .select({
      storeId: orders.storeId,
      landingPageId: orders.landingPageId,
      landingPageSlug: landingPages.slug,
      trackingConsent: orders.trackingConsent,
      domain: stores.domain,
    })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .leftJoin(landingPages, eq(landingPages.id, orders.landingPageId))
    .where(eq(orders.id, orderId))
    .then(first);
  if (!order) return 0;

  const tracking = await resolveChannelTracking(db, { storeId: order.storeId, landingPageId: order.landingPageId });
  const { sends, withoutCredentials } = conversionPlan(tracking, stage, order.trackingConsent);
  if (sends.length === 0 && withoutCredentials.length === 0) return 0;

  const referer = refererUrl && /^https?:\/\//.test(refererUrl) ? refererUrl : null;
  const eventSourceUrl = conversionSourceUrl(order.domain, order.landingPageSlug) ?? referer;
  const triggeredAt = Math.floor(Date.now() / 1000);
  for (const { provider, eventName } of withoutCredentials) {
    const payload: ConversionJobPayload = { orderId, provider, eventName, stage, triggeredAt, eventSourceUrl };
    await recordSkippedJob(db, { kind: CONVERSION_JOB, payload, dedupKey: `skipped:${conversionDedupKey(provider, orderId, eventName)}`, reason: "no_access_token" });
    if (provider === "meta") {
      await db
        .insert(capiEventLog)
        .values({
          id: crypto.randomUUID(),
          orderId,
          eventName,
          stage,
          status: "skipped",
          pixelId: tracking?.meta?.pixelId ?? null,
          error: "No CAPI access token — configure it in Settings → Tracking",
          sentAt: new Date().toISOString(),
        })
        .onConflictDoNothing();
    }
  }
  let queued = 0;
  for (const { provider, eventName } of sends) {
    const payload: ConversionJobPayload = { orderId, provider, eventName, stage, triggeredAt, eventSourceUrl };
    if (await enqueueJob(db, { kind: CONVERSION_JOB, payload, dedupKey: conversionDedupKey(provider, orderId, eventName) })) queued++;
  }
  return queued;
}

export async function enqueueConversionsForStatus(db: AppDb, orderId: string, status: string): Promise<number> {
  if (!["confirmed", "delivered", "out_for_delivery"].includes(status)) return 0;
  const order = await db.select({ wilayaId: orders.wilayaId }).from(orders).where(eq(orders.id, orderId)).then(first);
  const stage = conversionStageFor(status, order?.wilayaId);
  return stage ? enqueueConversions(db, { orderId, stage }) : 0;
}

function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] || undefined, lastName: parts.length > 1 ? parts[parts.length - 1] : undefined };
}

async function logMeta(
  platform: pg.Pool,
  storeId: string,
  p: ConversionJobPayload,
  pixelId: string | null,
  outcome: { status: "sent" | "failed"; reference?: string | null; error?: string | null },
) {
  await platform
    .query(
      `insert into capi_event_log (store_id, id, order_id, event_name, stage, status, pixel_id, meta_event_id, error, sent_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (order_id, stage, event_name)
       do update set status = excluded.status, pixel_id = excluded.pixel_id, meta_event_id = excluded.meta_event_id,
                     error = excluded.error, sent_at = excluded.sent_at`,
      [
        storeId,
        crypto.randomUUID(),
        p.orderId,
        p.eventName,
        p.stage,
        outcome.status,
        pixelId,
        outcome.reference ?? null,
        outcome.error ?? null,
        new Date().toISOString(),
      ],
    )
    .catch((err) => console.warn("[conversions] audit row failed:", err instanceof Error ? err.message : err));
}

export function conversionJobHandler(platform: pg.Pool): JobHandler {
  return async (job) => {
    const p = job.payload as ConversionJobPayload;
    const storeId = job.storeId;
    if (!storeId) throw new PermanentJobError("conversion job without a store");
    const db = getDb(platform);

    const order = await db
      .select({
        customerId: orders.customerId,
        customerName: orders.customerName,
        phone: orders.phone,
        customerEmail: orders.customerEmail,
        communeId: orders.communeId,
        price: orders.price,
        deliveryFee: orders.deliveryFee,
        landingPageId: orders.landingPageId,
        trackingConsent: orders.trackingConsent,
        fbc: orders.fbc,
        fbp: orders.fbp,
        ttclid: orders.ttclid,
        adCookies: orders.adCookies,
        ipAddress: orders.ipAddress,
        userAgent: orders.userAgent,
      })
      .from(orders)
      .where(and(eq(orders.id, p.orderId), eq(orders.storeId, storeId)))
      .then(first);
    if (!order) throw new PermanentJobError(`order ${p.orderId} not found`);

    const tracking = await resolveChannelTracking(db, { storeId, landingPageId: order.landingPageId });
    const due = serverConversions(tracking, p.stage, order.trackingConsent).some(
      (s) => s.provider === p.provider && s.eventName === p.eventName,
    );
    if (!due) return { skipped: "not_configured" };
    if (p.provider !== "ga4" && Date.now() / 1000 - p.triggeredAt >= SEVEN_DAYS_SECONDS) return { skipped: "event_time_expired" };

    const [commune, products] = await Promise.all([
      order.communeId
        ? db.select({ name: communes.name, postalCode: communes.postalCode }).from(communes).where(eq(communes.id, order.communeId)).then(first)
        : undefined,
      db
        .select({ productId: orderProducts.productId })
        .from(orderProducts)
        .where(and(eq(orderProducts.orderId, p.orderId), eq(orderProducts.storeId, storeId))),
    ]);

    const conversion: ServerConversion = {
      eventName: p.eventName,
      eventId: p.orderId,
      eventTime: p.triggeredAt,
      eventSourceUrl: p.eventSourceUrl,
      value: p.eventName === "Purchase" ? order.price + (order.deliveryFee ?? 0) : undefined,
      currency: "DZD",
      contentIds: [...new Set(products.map((r) => r.productId).filter((id): id is string => Boolean(id)))],
      user: {
        phone: order.phone,
        email: order.customerEmail,
        ...splitName(order.customerName),
        externalId: order.customerId,
        city: commune?.name ?? null,
        postalCode: commune?.postalCode ?? null,
        ip: order.ipAddress,
        userAgent: order.userAgent,
        fbc: order.fbc,
        fbp: order.fbp,
        ttclid: order.ttclid,
        ttp: order.adCookies?.ttp ?? null,
        scid: order.adCookies?.scid ?? null,
        gaClientId: order.adCookies?.gaClientId ?? null,
      },
    };

    const pixelId = p.provider === "meta" ? tracking!.meta!.pixelId : null;
    let result;
    try {
      result = await SENDERS[p.provider](tracking!, conversion, {});
    } catch (err) {
      if (p.provider === "meta") await logMeta(platform, storeId, p, pixelId, { status: "failed", error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    if (p.provider === "meta") {
      await logMeta(platform, storeId, p, pixelId, { status: result.success ? "sent" : "failed", reference: result.reference, error: result.error });
    }
    if (!result.success) throw new PermanentJobError(result.error ?? "rejected by the provider");
    return { sent: true, reference: result.reference ?? null };
  };
}
