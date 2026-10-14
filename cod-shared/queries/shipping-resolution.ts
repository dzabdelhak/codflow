/**
 * Delivery-fee resolution for storefront checkout.
 *
 * This is the single implementation of "what does this customer pay for
 * delivery". It honours the two layers the schema documents:
 *
 *   profile  — channel_products.shipping_profile_id overrides the store default
 *   commune  — shipping_rule_communes overrides the wilaya rule, per column
 *
 * Returns:
 *   number — the fee in DZD (0 is a legitimate free-delivery price)
 *   null   — delivery is NOT available for this wilaya/commune/type; the
 *            caller must refuse the order rather than ship for free
 *   0      — when the store has no shipping profile at all (fresh store),
 *            mirroring the dashboard's "no profile, no restriction" semantics
 */

import { eq, and, inArray, sql } from "drizzle-orm";
import {
  products,
  channelProducts,
  stores,
  merchants,
  shippingProfiles,
  shippingRules,
  shippingRuleCommunes,
} from "../db/schema";
import type { AppDb } from "../db/client";
import { first } from "../db/client";
import { chunkIds } from "./d1-limits";

export interface DeliveryModes {
  home: boolean;
  stopDesk: boolean;
}

export interface GridModes extends DeliveryModes {
  rules: number;
}

export function offeredDeliveryModes(enabled: DeliveryModes, grid: GridModes): DeliveryModes {
  if (grid.rules === 0) return enabled;
  const offered = { home: enabled.home && grid.home, stopDesk: enabled.stopDesk && grid.stopDesk };
  return offered.home || offered.stopDesk ? offered : enabled;
}

export async function channelGridModes(db: AppDb, storeDefaultProfileId: string | null): Promise<GridModes> {
  const row = await db
    .select({
      home: sql<boolean>`coalesce(bool_or(${shippingRules.homeEnabled}), false)`,
      stopDesk: sql<boolean>`coalesce(bool_or(${shippingRules.stopDeskEnabled}), false)`,
      rules: sql<number>`count(*)::int`,
    })
    .from(shippingRules)
    .where(
      eq(
        shippingRules.profileId,
        sql`coalesce(${storeDefaultProfileId}::text, (select p.id from shipping_profiles p where p.is_default order by p.created_at, p.id limit 1))`,
      ),
    )
    .then(first);
  return { home: !!row?.home, stopDesk: !!row?.stopDesk, rules: Number(row?.rules ?? 0) };
}

const DEFAULT_PROFILE_ID = sql<string | null>`coalesce(${stores.defaultShippingProfileId}, (select p.id from shipping_profiles p where p.is_default order by p.created_at, p.id limit 1))`;

export function channelDefaultProfile(db: AppDb) {
  return db
    .select({ id: DEFAULT_PROFILE_ID })
    .from(stores)
    .where(eq(stores.id, sql`current_setting('app.store_id', true)`));
}

export async function currentGridVersion(db: AppDb): Promise<number | null> {
  const row = await db.select({ version: merchants.deliveryGridVersion }).from(merchants).then(first);
  return row?.version ?? null;
}

export interface DeliveryFeeParams {
  /**
   * Products on the order. Empty is allowed and resolves the store default —
   * that is the shape callers without product context use.
   */
  productIds: string[];
  wilayaId: number;
  /** null skips commune resolution and stops at the wilaya rule. */
  communeId?: string | null;
  deliveryType: "home" | "stop_desk";
  /**
   * Store whose delivery-pricing settings govern this order. Omitted, the
   * platform defaults apply: highest rate wins, no free-delivery threshold.
   */
  storeId?: string | null;
  /**
   * Basket subtotal in DZD, priced from the catalog. Required for the
   * free-delivery threshold to be testable; without it the threshold is
   * skipped rather than guessed at.
   */
  subtotal?: number;
}

/** Store settings that change what delivery costs. */
interface DeliveryPricingSettings {
  freeShippingThreshold: number | null;
  cartShippingMode: "highest" | "default_profile";
}

const PLATFORM_DEFAULTS: DeliveryPricingSettings = {
  freeShippingThreshold: null,
  cartShippingMode: "highest",
};

/**
 * Every shipping profile the basket touches.
 *
 * Each product contributes its own profile when it has one, and the store
 * default otherwise. A basket of one product yields one profile, which is why
 * the single-product behaviour is unchanged.
 */
function candidateProfileIds(
  productProfileIds: (string | null)[],
  defaultProfileId: string | null,
  mode: DeliveryPricingSettings["cartShippingMode"],
): string[] {
  // "default_profile": the merchant has said every item ships the same way, so
  // per-product profiles are deliberately ignored.
  if (mode === "default_profile") {
    return defaultProfileId ? [defaultProfileId] : [];
  }

  const ids = new Set<string>();
  for (const own of productProfileIds) {
    const resolved = own ?? defaultProfileId;
    if (resolved) ids.add(resolved);
  }
  // No products supplied (callers without product context) → the default.
  if (ids.size === 0 && defaultProfileId) ids.add(defaultProfileId);
  return [...ids];
}

export async function resolveDeliveryFee(
  db: AppDb,
  params: DeliveryFeeParams,
): Promise<number | null> {
  const { productIds, wilayaId, communeId, deliveryType, storeId, subtotal } = params;

  // ── Round trip 1: the store default profile + the products' own profiles ──
  //
  // Both are needed to pick the candidates and neither depends on the other,
  // so they go out together rather than in sequence.
  type ProductProfileRow = { productId: string; shippingProfileId: string | null };

  const productStatements = chunkIds(productIds).map((chunk) =>
    db
      .select({ productId: channelProducts.productId, shippingProfileId: channelProducts.shippingProfileId })
      .from(channelProducts)
      .where(inArray(channelProducts.productId, chunk)),
  );

  // The store's pricing settings ride the SAME batch as the profile lookups —
  // they are needed before anything can be priced and depend on nothing here,
  // so reading them costs no extra round trip.
  type SettingsRow = {
    freeShippingThreshold: number | null;
    cartShippingMode: "highest" | "default_profile";
    defaultProfileId: string | null;
  };
  const settingsStatement = db
    .select({
      freeShippingThreshold: stores.freeShippingThreshold,
      cartShippingMode: stores.cartShippingMode,
      defaultProfileId: DEFAULT_PROFILE_ID,
    })
    .from(stores)
    .where(eq(stores.id, storeId ?? sql`current_setting('app.store_id', true)`));

  type BatchStatement = Parameters<AppDb["batch"]>[0][number];
  const statements = [settingsStatement, ...productStatements] as unknown as [BatchStatement, ...BatchStatement[]];

  const results = (await db.batch(statements)) as unknown as Array<Array<ProductProfileRow | SettingsRow>>;

  const settingsRow = (results[0] as SettingsRow[])[0];
  const defaultProfileId = settingsRow?.defaultProfileId ?? null;
  const assigned = new Map(
    (results.slice(1).flat() as ProductProfileRow[]).map((r) => [r.productId, r.shippingProfileId]),
  );
  const productProfileIds = productIds.map((id) => assigned.get(id) ?? null);

  const settings: DeliveryPricingSettings =
    storeId && settingsRow
      ? {
          ...PLATFORM_DEFAULTS,
          freeShippingThreshold: settingsRow.freeShippingThreshold,
          cartShippingMode: settingsRow.cartShippingMode,
        }
      : PLATFORM_DEFAULTS;

  // No existence check on a product's profile: channel_products.shipping_profile_id is
  // a foreign key with ON DELETE SET NULL, and D1 enforces it — a dangling
  // value cannot be written. Verifying it would cost a round trip per checkout
  // to rule out a state the database already prevents.
  const profileIds = candidateProfileIds(
    productProfileIds,
    defaultProfileId,
    settings.cartShippingMode,
  );

  // No profile anywhere: fresh store, nothing configured. Not a refusal.
  if (profileIds.length === 0) return 0;

  // ── Round trip 2: each profile's wilaya rule + its commune override ───────
  //
  // Selected as raw values rather than through the schema's boolean mapper:
  // on a LEFT JOIN miss these columns are SQL NULL, and NULL must stay
  // distinguishable from 0 ("inherit" vs "explicitly disabled").
  const selection = {
    profileId: shippingRules.profileId,
    homePrice: shippingRules.homePrice,
    stopDeskPrice: shippingRules.stopDeskPrice,
    homeEnabled: sql<number>`${shippingRules.homeEnabled}`,
    stopDeskEnabled: sql<number>`${shippingRules.stopDeskEnabled}`,
  };

  const rows = communeId
    ? await db
        .select({
          ...selection,
          cHomePrice: sql<number | null>`${shippingRuleCommunes.homePrice}`,
          cStopDeskPrice: sql<number | null>`${shippingRuleCommunes.stopDeskPrice}`,
          cHomeEnabled: sql<number | null>`${shippingRuleCommunes.homeEnabled}`,
          cStopDeskEnabled: sql<number | null>`${shippingRuleCommunes.stopDeskEnabled}`,
        })
        .from(shippingRules)
        .leftJoin(
          shippingRuleCommunes,
          and(
            eq(shippingRuleCommunes.ruleId, shippingRules.id),
            eq(shippingRuleCommunes.communeId, communeId),
          ),
        )
        .where(
          and(
            inArray(shippingRules.profileId, profileIds),
            eq(shippingRules.wilayaId, wilayaId),
          ),
        )
    : await db
        .select({
          ...selection,
          cHomePrice: sql<number | null>`NULL`,
          cStopDeskPrice: sql<number | null>`NULL`,
          cHomeEnabled: sql<number | null>`NULL`,
          cStopDeskEnabled: sql<number | null>`NULL`,
        })
        .from(shippingRules)
        .where(
          and(
            inArray(shippingRules.profileId, profileIds),
            eq(shippingRules.wilayaId, wilayaId),
          ),
        );

  const byProfile = new Map(rows.map((r) => [r.profileId, r]));

  // Highest rate in the basket wins (SHOPPING_CART_PLAN Q1). Resolving every
  // candidate first is required: the dearest profile for THIS wilaya is only
  // known after each one is priced, not from the profile itself.
  let fee = -1;
  for (const profileId of profileIds) {
    const row = byProfile.get(profileId);

    // A product whose profile does not cover this wilaya cannot be delivered,
    // so neither can the basket. Refusing beats quietly shipping the rest.
    if (!row) return null;

    // `??` is the whole commune rule: a NULL column inherits, a 0 does not.
    // `0 ?? x` is 0, which is what "explicitly disabled" has to mean.
    const enabled =
      deliveryType === "home"
        ? (row.cHomeEnabled ?? row.homeEnabled)
        : (row.cStopDeskEnabled ?? row.stopDeskEnabled);
    if (!enabled) return null;

    const price =
      deliveryType === "home"
        ? (row.cHomePrice ?? row.homePrice)
        : (row.cStopDeskPrice ?? row.stopDeskPrice);

    if (price > fee) fee = price;
  }

  if (fee < 0) return null;

  // Free-delivery threshold, applied last so it overrides whatever the profile
  // and commune rules produced. `null` (unavailable) is returned above and is
  // never reached here: a wilaya the merchant does not serve never becomes
  // free, it stays refused.
  //
  // `>= threshold` — a basket landing exactly on the number qualifies, which is
  // what "free delivery over 10,000" means to a shopper looking at 10,000.
  // A threshold of 0 is rejected at the settings seam, so it cannot silently
  // mean "everything ships free".
  if (
    settings.freeShippingThreshold != null &&
    settings.freeShippingThreshold > 0 &&
    subtotal != null &&
    subtotal >= settings.freeShippingThreshold
  ) {
    return 0;
  }

  return fee;
}
