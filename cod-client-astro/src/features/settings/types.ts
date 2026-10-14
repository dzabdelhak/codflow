import type { ChannelStatus } from "../../../../cod-shared/channels/lifecycle";

export type StoreLang = "ar" | "en" | "fr";
export type StoreStatus = ChannelStatus;

/** The single tenant's configuration as returned by the stores API. */
export interface StoreConfig {
  id: string;
  name: string;
  domain: string | null;
  logoUrl: string | null;
  themeId: string;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  fontFamily: string;
  fontUrl: string | null;
  lang: StoreLang;
  currency: string;
  currencySymbol: string;
  contentJson: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  announcementBar: string | null;
  reviewsEnabled: boolean;
  /** Shopping cart opt-in. False keeps the storefront exactly as it is. */
  cartEnabled: boolean;
  orderLimitMinutes: number;
  /** Order subtotal (DZD) at or above which delivery is free. null = off. */
  freeShippingThreshold: number | null;
  /** Which rate a basket spanning several shipping profiles pays. */
  cartShippingMode: "highest" | "default_profile";
  defaultShippingProfileId?: string | null;
  status: StoreStatus;
  storeApiKey: string | null;
}

export type UpdateStoreData = Partial<
  Pick<
    StoreConfig,
    | "name"
    | "domain"
    | "logoUrl"
    | "primaryColor"
    | "accentColor"
    | "bgColor"
    | "fontFamily"
    | "fontUrl"
    | "lang"
    | "currencySymbol"
    | "contentJson"
    | "metaTitle"
    | "metaDescription"
    | "ogImage"
    | "announcementBar"
    | "reviewsEnabled"
    | "cartEnabled"
    | "orderLimitMinutes"
    | "freeShippingThreshold"
    | "cartShippingMode"
    | "defaultShippingProfileId"
  >
>;

/** Meta pixel tracking configuration. Absent until first saved. */
export interface PixelConfig {
  id: string;
  storeId: string;
  pixelId: string | null;
  adAccountName: string | null;
  accessTokenMasked: string;
  testEventCode: string | null;
  conversionEvent: "Purchase" | "Purchase_Confirmed" | "Purchase_Delivered" | "Lead";
  testMode: boolean;
  enabled: boolean;
  /** Master switch for per-landing-page pixels — off means every page uses this one. */
  perPageTrackingEnabled: boolean;
  tiktokPixelId: string | null;
  tiktokAccessTokenMasked: string | null;
  tiktokTestEventCode: string | null;
  snapPixelId: string | null;
  snapAccessTokenMasked: string | null;
  ga4MeasurementId: string | null;
  ga4ApiSecretMasked: string | null;
  googleAdsId: string | null;
  googleAdsLabel: string | null;
  consentRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ServerTrackingProvider = "meta" | "tiktok" | "snap" | "ga4";

export interface TrackingTestResult {
  provider: ServerTrackingProvider;
  ok: boolean;
  message: string | null;
  reference: string | null;
}

export interface ConversionEventRow {
  id: string;
  provider: ServerTrackingProvider;
  eventName: "Purchase" | "Lead";
  stage: "checkout" | "confirmed" | "delivered";
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  lastError: string | null;
  result: { skipped?: string } | null;
  createdAt: string;
  finishedAt: string | null;
  nextAttemptAt: string;
  orderId: string | null;
  orderNumber: string | null;
}

export interface SavePixelConfigData {
  pixelId: string | null;
  adAccountName?: string | null;
  accessToken?: string | null;
  testEventCode?: string | null;
  conversionEvent: "Purchase" | "Purchase_Confirmed" | "Purchase_Delivered" | "Lead";
  testMode?: boolean;
  enabled?: boolean;
  /** Omitted keeps the stored value — an unrelated edit must not reset it. */
  perPageTrackingEnabled?: boolean;
  tiktokPixelId?: string | null;
  tiktokAccessToken?: string | null;
  tiktokTestEventCode?: string | null;
  snapPixelId?: string | null;
  snapAccessToken?: string | null;
  ga4MeasurementId?: string | null;
  ga4ApiSecret?: string | null;
  googleAdsId?: string | null;
  googleAdsLabel?: string | null;
  consentRequired?: boolean;
}

/** WhatsApp OTP verification configuration (dzverify). Absent until first saved — null = disabled. */
export interface OtpConfig {
  language: "en" | "fr" | "ar";
  enabled: boolean;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveOtpConfigData {
  apiKey?: string;
  language?: "en" | "fr" | "ar";
  enabled?: boolean;
}

export interface OtpConnectionCheck {
  ok: boolean;
  reason?: string;
  message?: string;
  balanceDa?: number;
  otpEstimate?: number;
  plan?: string;
  outOfCredits?: boolean;
}

/** Cloudflare Turnstile checkout bot-protection configuration. Absent until first saved — null = disabled. */
export interface TurnstileConfig {
  siteKey: string;
  enabled: boolean;
  secretKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveTurnstileConfigData {
  siteKey?: string;
  secretKey?: string;
  enabled?: boolean;
}

/** Sendili transactional email configuration. Absent until first saved — null = disabled. */
export interface EmailConfig {
  fromEmail: string;
  fromName: string | null;
  enabled: boolean;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveEmailConfigData {
  apiKey?: string;
  fromEmail: string;
  fromName?: string | null;
  enabled?: boolean;
}

export interface EmailConnectionCheck {
  ok: boolean;
  reason?: string;
  message?: string;
  domains?: string[];
  outOfCredits?: boolean;
}
