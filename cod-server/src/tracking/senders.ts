import type { ChannelTracking } from "../../../cod-shared/queries/tracking-config";
import type { ServerProvider } from "../../../cod-shared/tracking/identifiers";
import { providerEventName } from "../../../cod-shared/tracking/events";
import { normaliseAsciiText, normaliseName, normalisePhone, sendCapiEvent, sha256hex } from "@/lib/capi";

export interface ServerConversion {
  eventName: "Lead" | "Purchase";
  eventId: string;
  eventTime: number;
  eventSourceUrl: string | null;
  value?: number;
  currency: string;
  contentIds: string[];
  user: {
    phone: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    externalId?: string | null;
    city?: string | null;
    postalCode?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    fbc?: string | null;
    fbp?: string | null;
    ttclid?: string | null;
    ttp?: string | null;
    scid?: string | null;
    gaClientId?: string | null;
  };
}

export interface SendOptions {
  test?: boolean;
}

export interface SendResult {
  success: boolean;
  reference?: string | null;
  error?: string;
}

const TIKTOK_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
const SNAP_URL = "https://tr.snapchat.com/v3";
const GA4_URL = "https://www.google-analytics.com";

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`network error: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}: ${json?.message ?? json?.error?.message ?? "no message"}`);
  return { status: res.status, json };
}

async function sendMeta(tracking: ChannelTracking, e: ServerConversion, { test }: SendOptions): Promise<SendResult> {
  const meta = tracking.meta!;
  const testEventCode = test || meta.testMode ? meta.testEventCode : null;
  if (test && !testEventCode) return { success: false, error: "test_event_code_missing" };
  const result = await sendCapiEvent(meta.pixelId, meta.accessToken, {
    eventName: e.eventName,
    eventId: e.eventId,
    eventTime: e.eventTime,
    eventSourceUrl: e.eventSourceUrl,
    userData: {
      phone: e.user.phone,
      email: e.user.email,
      firstName: e.user.firstName,
      lastName: e.user.lastName,
      externalId: e.user.externalId,
      city: e.user.city,
      postalCode: e.user.postalCode,
      fbc: e.user.fbc,
      fbp: e.user.fbp,
      clientIpAddress: e.user.ip,
      clientUserAgent: e.user.userAgent,
    },
    value: e.eventName === "Purchase" ? e.value : undefined,
    currency: e.currency,
    contentIds: e.contentIds,
    testEventCode,
  });
  return { success: result.success, reference: result.fbtrace_id ?? null, error: result.error };
}

async function sendTikTok(tracking: ChannelTracking, e: ServerConversion, { test }: SendOptions): Promise<SendResult> {
  const tiktok = tracking.tiktok!;
  const testEventCode = test || tracking.testMode ? tiktok.testEventCode : null;
  if (test && !testEventCode) return { success: false, error: "test_event_code_missing" };
  const user: Record<string, string> = { phone: await sha256hex(`+${normalisePhone(e.user.phone)}`) };
  if (e.user.email) user.email = await sha256hex(e.user.email);
  if (e.user.externalId) user.external_id = await sha256hex(e.user.externalId);
  if (e.user.ip) user.ip = e.user.ip;
  if (e.user.userAgent) user.user_agent = e.user.userAgent;
  if (e.user.ttclid) user.ttclid = e.user.ttclid;
  if (e.user.ttp) user.ttp = e.user.ttp;
  const { status, json } = await post(
    TIKTOK_URL,
    {
      event_source: "web",
      event_source_id: tiktok.pixelId,
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
      data: [
        {
          event: providerEventName("tiktok", e.eventName),
          event_time: e.eventTime,
          event_id: e.eventId,
          user,
          properties: {
            currency: e.currency,
            ...(e.value !== undefined ? { value: e.value } : {}),
            content_type: "product",
            contents: e.contentIds.map((id) => ({ content_id: id })),
          },
          ...(e.eventSourceUrl ? { page: { url: e.eventSourceUrl } } : {}),
        },
      ],
    },
    { "Access-Token": tiktok.accessToken! },
  );
  if (status >= 400 || json?.code !== 0) return { success: false, error: json?.message ?? `HTTP ${status}` };
  return { success: true, reference: json?.request_id ?? null };
}

async function sendSnap(tracking: ChannelTracking, e: ServerConversion, { test }: SendOptions): Promise<SendResult> {
  const snap = tracking.snap!;
  const userData: Record<string, unknown> = { ph: [await sha256hex(normalisePhone(e.user.phone))] };
  if (e.user.email) userData.em = [await sha256hex(e.user.email)];
  if (e.user.externalId) userData.external_id = [await sha256hex(e.user.externalId)];
  if (e.user.firstName) userData.fn = [await sha256hex(normaliseName(e.user.firstName))];
  if (e.user.lastName) userData.ln = [await sha256hex(normaliseName(e.user.lastName))];
  if (e.user.city) userData.ct = [await sha256hex(normaliseAsciiText(e.user.city))];
  if (e.user.ip) userData.client_ip_address = e.user.ip;
  if (e.user.userAgent) userData.client_user_agent = e.user.userAgent;
  if (e.user.scid) userData.sc_cookie1 = e.user.scid;
  const path = test ? "events/validate" : "events";
  const { status, json } = await post(
    `${SNAP_URL}/${encodeURIComponent(snap.pixelId)}/${path}?access_token=${encodeURIComponent(snap.accessToken!)}`,
    {
      data: [
        {
          event_name: providerEventName("snap", e.eventName),
          action_source: "WEB",
          event_time: e.eventTime,
          event_id: e.eventId,
          ...(e.eventSourceUrl ? { event_source_url: e.eventSourceUrl } : {}),
          user_data: userData,
          custom_data: {
            currency: e.currency,
            ...(e.value !== undefined ? { value: e.value } : {}),
            content_ids: e.contentIds,
            order_id: e.eventId,
          },
        },
      ],
    },
  );
  if (status >= 400) return { success: false, error: json?.reason ?? json?.message ?? json?.error?.message ?? `HTTP ${status}` };
  return { success: true, reference: json?.request_id ?? null };
}

async function gaClientId(e: ServerConversion): Promise<string> {
  const fromCookie = e.user.gaClientId?.match(/(\d+\.\d+)$/)?.[1];
  if (fromCookie) return fromCookie;
  const hex = await sha256hex(e.eventId);
  return `${parseInt(hex.slice(0, 8), 16)}.${parseInt(hex.slice(8, 16), 16)}`;
}

async function sendGa4(tracking: ChannelTracking, e: ServerConversion, { test }: SendOptions): Promise<SendResult> {
  const ga4 = tracking.ga4!;
  const query = `measurement_id=${encodeURIComponent(ga4.measurementId)}&api_secret=${encodeURIComponent(ga4.apiSecret!)}`;
  const recent = Date.now() / 1000 - e.eventTime < 72 * 3600;
  const { status, json } = await post(`${GA4_URL}/${test ? "debug/mp" : "mp"}/collect?${query}`, {
    client_id: await gaClientId(e),
    ...(recent ? { timestamp_micros: e.eventTime * 1_000_000 } : {}),
    events: [
      {
        name: providerEventName("ga4", e.eventName),
        params: {
          transaction_id: e.eventId,
          currency: e.currency,
          ...(e.value !== undefined ? { value: e.value } : {}),
          items: e.contentIds.map((id) => ({ item_id: id })),
          engagement_time_msec: 1,
        },
      },
    ],
  });
  if (status >= 400) return { success: false, error: `HTTP ${status}` };
  const problems = (json?.validationMessages ?? []) as Array<{ description?: string }>;
  if (problems.length) return { success: false, error: problems.map((m) => m.description).join("; ") };
  return { success: true };
}

export const SENDERS: Record<ServerProvider, (tracking: ChannelTracking, e: ServerConversion, options: SendOptions) => Promise<SendResult>> = {
  meta: sendMeta,
  tiktok: sendTikTok,
  snap: sendSnap,
  ga4: sendGa4,
};
