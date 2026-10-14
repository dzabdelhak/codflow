import type { AppDb } from "../db/client";
import { storePixelConfig } from "../db/schema";
import { eq } from "drizzle-orm";
import { first } from "../db/client";

export type ConversionEvent = "Purchase" | "Purchase_Confirmed" | "Purchase_Delivered" | "Lead";

export async function getPixelConfig(db: AppDb, storeId?: string) {
  if (storeId) {
    return db
      .select()
      .from(storePixelConfig)
      .where(eq(storePixelConfig.storeId, storeId))
      .then(first);
  }
  return db
    .select()
    .from(storePixelConfig)
    .limit(1)
    .then(first);
}

export interface UpsertPixelConfigData {
  pixelId?: string | null;
  adAccountName?: string | null;
  accessToken?: string | null;
  testEventCode?: string | null;
  conversionEvent?: ConversionEvent;
  testMode?: boolean;
  enabled?: boolean;
  /**
   * Master switch for per-landing-page pixels. Omitted keeps what is stored —
   * renaming an ad account must not silently return every landing page to the
   * store pixel.
   */
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

type Existing = Awaited<ReturnType<typeof getPixelConfig>>;

function kept(value: string | null | undefined, previous: string | null | undefined): string | null {
  if (value === undefined) return previous ?? null;
  return value?.trim() || null;
}

function secret(value: string | null | undefined, previous: string | null | undefined): string | null {
  if (value === null) return null;
  return value?.trim() || previous || null;
}

function providerColumns(data: UpsertPixelConfigData, existing: Existing) {
  return {
    tiktokPixelId: kept(data.tiktokPixelId, existing?.tiktokPixelId),
    tiktokAccessToken: secret(data.tiktokAccessToken, existing?.tiktokAccessToken),
    tiktokTestEventCode: kept(data.tiktokTestEventCode, existing?.tiktokTestEventCode),
    snapPixelId: kept(data.snapPixelId, existing?.snapPixelId),
    snapAccessToken: secret(data.snapAccessToken, existing?.snapAccessToken),
    ga4MeasurementId: kept(data.ga4MeasurementId, existing?.ga4MeasurementId),
    ga4ApiSecret: secret(data.ga4ApiSecret, existing?.ga4ApiSecret),
    googleAdsId: kept(data.googleAdsId, existing?.googleAdsId),
    googleAdsLabel: kept(data.googleAdsLabel, existing?.googleAdsLabel),
    consentRequired: data.consentRequired ?? existing?.consentRequired ?? false,
  };
}

export async function upsertPixelConfig(
  db: AppDb,
  storeId: string,
  data: UpsertPixelConfigData,
) {
  const now = new Date().toISOString();
  const existing = await getPixelConfig(db, storeId);

  const accessToken = data.accessToken === null ? "" : data.accessToken?.trim() || existing?.accessToken || "";
  const adAccountName =
    data.adAccountName === undefined
      ? existing?.adAccountName ?? null
      : data.adAccountName?.trim() || null;
  const testEventCode =
    data.testEventCode === undefined
      ? existing?.testEventCode ?? null
      : data.testEventCode?.trim() || null;

  if (existing) {
    return db
      .update(storePixelConfig)
      .set({
        pixelId: kept(data.pixelId, existing.pixelId),
        ...providerColumns(data, existing),
        adAccountName,
        accessToken,
        testEventCode,
        conversionEvent: data.conversionEvent ?? existing.conversionEvent,
        testMode: data.testMode ?? existing.testMode,
        enabled: data.enabled ?? true,
        perPageTrackingEnabled:
          data.perPageTrackingEnabled ?? existing.perPageTrackingEnabled,
        updatedAt: now,
      })
      .where(eq(storePixelConfig.storeId, storeId))
      .returning()
      .then(first);
  }

  const row = {
    id: crypto.randomUUID(),
    storeId,
    pixelId: kept(data.pixelId, null),
    ...providerColumns(data, undefined),
    adAccountName,
    accessToken,
    testEventCode,
    conversionEvent: data.conversionEvent ?? "Purchase",
    testMode: data.testMode ?? false,
    enabled: data.enabled ?? true,
    perPageTrackingEnabled: data.perPageTrackingEnabled ?? false,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(storePixelConfig).values(row);
  return row;
}
