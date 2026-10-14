import { eq, sql } from "drizzle-orm";
import { channelProducts, productImages, products, stores } from "../db/schema";
import type { AppDb } from "../db/client";
import { first } from "../db/client";
import type { UnavailableRule } from "../channels/types";

export interface LandingMainProduct {
  productId: string;
  name: string;
  handle: string;
  price: number;
  status: string;
  visibility: boolean;
  published: boolean;
  deleted: boolean;
  primaryImageSrc: string | null;
}

export interface LandingChannel {
  unavailableRule: UnavailableRule;
  available: boolean;
  mainProduct: LandingMainProduct | null;
}

async function landingRule(db: AppDb, storeId: string): Promise<UnavailableRule | null> {
  const row = await db
    .select({ type: stores.channelType, rule: stores.unavailableRule })
    .from(stores)
    .where(eq(stores.id, storeId))
    .then(first);
  return row?.type === "landing" ? row.rule : null;
}

export async function isLandingChannel(db: AppDb, storeId: string): Promise<boolean> {
  return (await landingRule(db, storeId)) !== null;
}

export async function getLandingChannel(db: AppDb, storeId: string): Promise<LandingChannel | null> {
  const unavailableRule = await landingRule(db, storeId);
  if (!unavailableRule) return null;
  const [mainProduct, availability] = await Promise.all([
    db
      .select({
        productId: products.id,
        name: products.name,
        handle: products.handle,
        price: products.price,
        status: products.status,
        visibility: products.visibility,
        published: channelProducts.published,
        deleted: sql<boolean>`${products.deletedAt} is not null`,
        primaryImageSrc: sql<string | null>`(select ${productImages.src} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.position} limit 1)`,
      })
      .from(channelProducts)
      .innerJoin(products, eq(products.id, channelProducts.productId))
      .then(first),
    db.get<{ available: boolean }>(sql`select main_product_available(${storeId}) as available`),
  ]);
  return { unavailableRule, available: availability?.available === true, mainProduct: mainProduct ?? null };
}

export type ReplaceMainProductResult = { ok: true } | { ok: false; reason: "not_landing" | "unknown_product" };

export async function replaceMainProduct(db: AppDb, storeId: string, productId: string): Promise<ReplaceMainProductResult> {
  if (!(await isLandingChannel(db, storeId))) return { ok: false, reason: "not_landing" };
  const product = await db
    .select({ id: products.id, deletedAt: products.deletedAt })
    .from(products)
    .where(eq(products.id, productId))
    .then(first);
  if (!product || product.deletedAt) return { ok: false, reason: "unknown_product" };
  const now = new Date().toISOString();
  await db.delete(channelProducts).where(sql`${channelProducts.productId} <> ${productId}`);
  await db
    .insert(channelProducts)
    .values({ productId, published: true, position: 0, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [channelProducts.storeId, channelProducts.productId],
      set: { published: true, position: 0, updatedAt: now },
    });
  return { ok: true };
}

export async function setUnavailableRule(db: AppDb, storeId: string, rule: UnavailableRule): Promise<boolean> {
  const updated = await db
    .update(stores)
    .set({ unavailableRule: rule, updatedAt: new Date().toISOString() })
    .where(sql`${stores.id} = ${storeId} and ${stores.channelType} = 'landing'`)
    .returning({ id: stores.id });
  return updated.length > 0;
}
