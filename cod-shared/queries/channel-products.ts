import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { channelProducts, productImages, products, shippingProfiles } from "../db/schema";
import type { AppDb } from "../db/client";
import { first } from "../db/client";

type BatchStatement = Parameters<AppDb["batch"]>[0][number];

export interface ChannelSelection {
  published?: boolean;
  featured?: boolean;
  shippingProfileId?: string | null;
}

export const CHANNEL_STATE = {
  inChannel: sql<boolean>`(${channelProducts.productId} is not null)`,
  showInStore: sql<boolean>`coalesce(${channelProducts.published}, false)`,
  storeFeatured: sql<boolean>`coalesce(${channelProducts.featured}, false)`,
  channelPosition: channelProducts.position,
  shippingProfileId: channelProducts.shippingProfileId,
};

const nextPosition = sql<number>`coalesce((select max(cp.position) + 1 from channel_products cp), 0)`;

export async function setChannelSelection(db: AppDb, productId: string, selection: ChannelSelection): Promise<void> {
  const now = new Date().toISOString();
  const changes: Partial<typeof channelProducts.$inferInsert> = { updatedAt: now };
  if (selection.published !== undefined) changes.published = selection.published;
  if (selection.featured !== undefined) changes.featured = selection.featured;
  if (selection.shippingProfileId !== undefined) changes.shippingProfileId = selection.shippingProfileId;
  await db
    .insert(channelProducts)
    .values({
      productId,
      published: selection.published ?? true,
      featured: selection.featured ?? false,
      shippingProfileId: selection.shippingProfileId ?? null,
      position: nextPosition,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({ target: [channelProducts.storeId, channelProducts.productId], set: changes });
}

export async function addToChannel(db: AppDb, productIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (const productId of productIds) {
    await db
      .insert(channelProducts)
      .values({ productId, position: nextPosition, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
  }
}

export async function removeFromChannel(db: AppDb, productId: string): Promise<boolean> {
  const removed = await db
    .delete(channelProducts)
    .where(eq(channelProducts.productId, productId))
    .returning({ productId: channelProducts.productId });
  return removed.length > 0;
}

export async function reorderChannel(db: AppDb, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  const now = new Date().toISOString();
  const statements = productIds.map((productId, position) =>
    db.update(channelProducts).set({ position, updatedAt: now }).where(eq(channelProducts.productId, productId)),
  ) as BatchStatement[];
  await db.batch(statements as [BatchStatement, ...BatchStatement[]]);
}

export async function listChannelProducts(db: AppDb) {
  return db
    .select({
      productId: products.id,
      name: products.name,
      handle: products.handle,
      price: products.price,
      status: products.status,
      visibility: products.visibility,
      published: channelProducts.published,
      featured: channelProducts.featured,
      position: channelProducts.position,
      shippingProfileId: channelProducts.shippingProfileId,
      primaryImageSrc: sql<string | null>`(select ${productImages.src} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.position} limit 1)`,
    })
    .from(channelProducts)
    .innerJoin(products, eq(products.id, channelProducts.productId))
    .where(isNull(products.deletedAt))
    .orderBy(channelProducts.position, products.name);
}

export async function catalogueProductIds(db: AppDb, productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, productIds), isNull(products.deletedAt)));
  return new Set(rows.map((r) => r.id));
}

export async function isStoreShippingProfile(db: AppDb, profileId: string): Promise<boolean> {
  return !!(await db.select({ id: shippingProfiles.id }).from(shippingProfiles).where(eq(shippingProfiles.id, profileId)).then(first));
}
