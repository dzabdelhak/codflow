export type TrackingProvider = "meta" | "tiktok" | "snap" | "ga4" | "googleAds";
export type ServerProvider = "meta" | "tiktok" | "snap" | "ga4";

export const TRACKING_PROVIDERS: TrackingProvider[] = ["meta", "tiktok", "snap", "ga4", "googleAds"];
export const SERVER_PROVIDERS: ServerProvider[] = ["meta", "tiktok", "snap", "ga4"];

export const IDENTIFIER_PATTERNS = {
  metaPixelId: /^\d{15,16}$/,
  tiktokPixelId: /^[A-Z0-9]{20}$/,
  snapPixelId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ga4MeasurementId: /^G-[A-Z0-9]{6,12}$/,
  googleAdsId: /^AW-\d{8,12}$/,
  googleAdsLabel: /^[A-Za-z0-9_-]{6,40}$/,
} as const;

export type IdentifierField = keyof typeof IDENTIFIER_PATTERNS;

export function normaliseIdentifier(field: IdentifierField, raw: string): string {
  const value = raw.trim();
  if (field === "tiktokPixelId" || field === "ga4MeasurementId" || field === "googleAdsId") return value.toUpperCase();
  if (field === "snapPixelId") return value.toLowerCase();
  return value;
}

export function isValidIdentifier(field: IdentifierField, raw: string): boolean {
  return IDENTIFIER_PATTERNS[field].test(normaliseIdentifier(field, raw));
}
