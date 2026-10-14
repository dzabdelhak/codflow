// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CORE ENGINE — DO NOT MODIFY                                         ║
// ║  Fires one funnel event at every tracker the page loaded, under the  ║
// ║  provider's own name. Conversion events carry the order id as their  ║
// ║  deduplication id — the id the server-side conversion uses too.      ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { providerEventName, type FunnelEvent } from "../../../../../cod-shared/tracking/events";
import type { TrackingProvider } from "../../../../../cod-shared/tracking/identifiers";
import { CONSENT_COOKIE, CONSENT_EVENT, type PageTrackers } from "./config";

export type { FunnelEvent };

export interface TrackItem {
  id: string;
  quantity?: number;
  price?: number;
}

export interface TrackData {
  value?: number;
  currency?: string;
  items?: TrackItem[];
}

export interface TrackOptions {
  eventId?: string;
  events?: Partial<Record<TrackingProvider, FunnelEvent | null>>;
}

type Fn = (...args: unknown[]) => void;

const win = () => window as unknown as Record<string, unknown> & { __codTrackers?: PageTrackers };
const fn = (name: string): Fn | null => (typeof win()[name] === "function" ? (win()[name] as Fn) : null);

export function consentDecision(): "granted" | "denied" | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))?.[1];
  return value === "granted" || value === "denied" ? value : null;
}

export function setConsent(granted: boolean): void {
  document.cookie = `${CONSENT_COOKIE}=${granted ? "granted" : "denied"}; Max-Age=${180 * 24 * 3600}; Path=/; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { granted } }));
}

const waiting: Array<() => void> = [];
let listening = false;

function whenAllowed(send: () => void): void {
  const trackers = win().__codTrackers;
  if (!trackers) return;
  if (!trackers.consentRequired) return send();
  const decision = consentDecision();
  if (decision === "granted") return send();
  if (decision === "denied") return;
  waiting.push(send);
  if (listening) return;
  listening = true;
  window.addEventListener(CONSENT_EVENT, (e) => {
    const granted = (e as CustomEvent<{ granted: boolean }>).detail?.granted;
    const queued = waiting.splice(0);
    if (granted) queued.forEach((run) => run());
  });
}

function send(t: PageTrackers, provider: TrackingProvider, event: FunnelEvent, data: TrackData, eventId?: string): void {
  const name = providerEventName(provider, event);
  if (!name) return;
  const currency = data.currency ?? "DZD";
  const items = data.items ?? [];
  const ids = [...new Set(items.map((i) => i.id))];
  const units = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
  const value = data.value;

  if (provider === "meta" && t.meta) {
    fn("fbq")?.(
      "trackSingle",
      t.meta,
      name,
      {
        ...(ids.length ? { content_ids: ids, content_type: "product", contents: items.map((i) => ({ id: i.id, quantity: i.quantity ?? 1, item_price: i.price })), num_items: units } : {}),
        ...(value !== undefined ? { value, currency } : {}),
      },
      ...(eventId ? [{ eventID: eventId }] : []),
    );
  } else if (provider === "tiktok" && t.tiktok) {
    const ttq = win().ttq as { track?: Fn } | undefined;
    ttq?.track?.(
      name,
      {
        ...(ids.length ? { content_type: "product", contents: items.map((i) => ({ content_id: i.id, quantity: i.quantity ?? 1, price: i.price })) } : {}),
        ...(value !== undefined ? { value, currency } : {}),
      },
      ...(eventId ? [{ event_id: eventId }] : []),
    );
  } else if (provider === "snap" && t.snap) {
    fn("snaptr")?.("track", name, {
      ...(ids.length ? { item_ids: ids, number_items: units } : {}),
      ...(value !== undefined ? { price: value, currency } : {}),
      ...(eventId ? { transaction_id: eventId, client_dedup_id: eventId } : {}),
    });
  } else if (provider === "ga4" && t.ga4) {
    fn("gtag")?.("event", name, {
      send_to: t.ga4,
      ...(items.length ? { items: items.map((i) => ({ item_id: i.id, quantity: i.quantity ?? 1, price: i.price })) } : {}),
      ...(value !== undefined ? { value, currency } : {}),
      ...(eventId ? { transaction_id: eventId } : {}),
    });
  } else if (provider === "googleAds" && t.googleAds?.label) {
    fn("gtag")?.("event", name, {
      send_to: `${t.googleAds.id}/${t.googleAds.label}`,
      ...(value !== undefined ? { value, currency } : {}),
      ...(eventId ? { transaction_id: eventId } : {}),
    });
  }
}

const PROVIDERS: TrackingProvider[] = ["meta", "tiktok", "snap", "ga4", "googleAds"];

export function track(event: FunnelEvent, data: TrackData = {}, options: TrackOptions = {}): void {
  if (typeof window === "undefined") return;
  whenAllowed(() => {
    const trackers = win().__codTrackers;
    if (!trackers) return;
    for (const provider of PROVIDERS) {
      const providerEvent = options.events ? options.events[provider] : event;
      if (providerEvent) send(trackers, provider, providerEvent, data, options.eventId);
    }
  });
}
