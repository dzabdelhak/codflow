/**
 * Shared Meta Ads Conversion Model for CodFlow.
 *
 * Establishes one centralized business contract across:
 * - Storefront checkout (Pixel + CAPI)
 * - Merchant call-center phone confirmation (dashboard status update)
 * - Courier logistics delivery (Yalidine / ZR Express webhooks)
 * - the conversion job (queued in PostgreSQL), deduplicated per provider
 *
 * Grounded in .agents/skills/meta-ads/SKILL.md and official Meta documentation:
 * - capi-deduplication.md (eventID === event_id, matching event_name)
 * - pixel-reference-standard-events.md (Purchase at checkout, Lead at sign-up)
 * - capi-offline-events.md (delayed COD delivery conversion)
 */

export type ConversionStage = "checkout" | "confirmed" | "delivered";
export type MetaEventName = "Lead" | "Purchase";
export type ConversionMode = "Purchase" | "Purchase_Confirmed" | "Purchase_Delivered" | "Lead";

export interface ConversionDecision {
  shouldFire: boolean;
  eventName?: MetaEventName;
  stage?: ConversionStage;
  reason?: string;
}

/**
 * Maps a merchant's chosen tracking configuration to the active business stage.
 *
 * | Configuration        | Business stage       | Meta event |
 * |----------------------|----------------------|------------|
 * | Lead                 | Checkout             | Lead       |
 * | Purchase             | Checkout             | Purchase   |
 * | Purchase_Confirmed   | Phone confirmation   | Purchase   |
 * | Purchase_Delivered   | Delivery/payment     | Purchase   |
 */
export function resolveConversionForStage(
  mode: ConversionMode | null | undefined,
  stage: ConversionStage
): ConversionDecision {
  const resolvedMode: ConversionMode = mode ?? "Purchase";

  switch (stage) {
    case "checkout":
      if (resolvedMode === "Purchase") {
        return { shouldFire: true, eventName: "Purchase", stage: "checkout" };
      }
      if (resolvedMode === "Lead") {
        return { shouldFire: true, eventName: "Lead", stage: "checkout" };
      }
      return {
        shouldFire: false,
        reason: `Conversion mode is '${resolvedMode}' — checkout stage does not fire a conversion event.`,
      };

    case "confirmed":
      if (resolvedMode === "Purchase_Confirmed") {
        return { shouldFire: true, eventName: "Purchase", stage: "confirmed" };
      }
      return {
        shouldFire: false,
        reason: `Conversion mode is '${resolvedMode}' — phone confirmation stage does not fire a conversion event.`,
      };

    case "delivered":
      if (resolvedMode === "Purchase_Delivered") {
        return { shouldFire: true, eventName: "Purchase", stage: "delivered" };
      }
      return {
        shouldFire: false,
        reason: `Conversion mode is '${resolvedMode}' — delivery stage does not fire a conversion event.`,
      };

    default:
      return { shouldFire: false, reason: `Unknown stage: ${stage}` };
  }
}

/**
 * The page Meta is told an event happened on.
 *
 * Meta matches `event_source_url` against the verified domain and shows it in
 * Events Manager. For an order that came from a landing page, naming that page
 * costs nothing — it is the same domain — and says which creative produced the
 * sale, where "/thank-you" says nothing at all.
 *
 * Built in one place because every stage's conversion job needs it. Two copies would drift,
 * and an event's source URL changing between the checkout and the delivery
 * mirror is the kind of inconsistency nobody notices until attribution is
 * already wrong.
 */
export function conversionSourceUrl(
  storeDomain: string | null | undefined,
  landingPageSlug: string | null | undefined,
): string | undefined {
  if (!storeDomain) return undefined;
  const path = landingPageSlug ? `/lp/${landingPageSlug}` : "/thank-you";
  return `https://${storeDomain}${path}`;
}
