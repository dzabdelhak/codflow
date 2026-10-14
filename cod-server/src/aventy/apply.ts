import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { AppDb } from "../../../cod-shared/db/client";
import { first } from "../../../cod-shared/db/client";
import {
  channelProducts,
  productCategories,
  productImages,
  products,
  productVariants,
  shippingProfiles,
  shippingRules,
  stores,
} from "../../../cod-shared/db/schema";
import type { AventyDeliveryGrid, AventyProductCopy } from "./client";

const now = () => new Date().toISOString();
const slugOf = (text: string) =>
  text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
const idTag = (aventyId: string) => createHash("sha256").update(aventyId).digest("hex").slice(0, 16);
const handleOf = (copy: AventyProductCopy) => `${slugOf(copy.name)}-av${idTag(copy.id)}`;

async function categoryId(db: AppDb, category: AventyProductCopy["category"]): Promise<string | null> {
  if (!category) return null;
  const existing = await db.select({ id: productCategories.id, name: productCategories.name }).from(productCategories)
    .where(eq(productCategories.aventyId, category.id)).then(first);
  if (existing) {
    if (existing.name !== category.name) {
      await db.update(productCategories).set({ name: category.name, updatedAt: now() }).where(eq(productCategories.id, existing.id));
    }
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(productCategories).values({
    id, name: category.name, slug: `aventy-${idTag(category.id)}`, aventyId: category.id, createdAt: now(), updatedAt: now(),
  });
  return id;
}

function variantOptions(copy: AventyProductCopy): string | null {
  if (copy.variants.length === 0) return null;
  const values = new Map<string, Set<string>>();
  for (const variant of copy.variants) {
    for (const [name, value] of Object.entries(variant.options)) {
      if (!values.has(name)) values.set(name, new Set());
      values.get(name)!.add(value);
    }
  }
  return JSON.stringify([...values].map(([name, set]) => ({ name, values: [...set].map((value) => ({ value })) })));
}

async function publishInChannel(db: AppDb, productId: string) {
  await db.insert(channelProducts)
    .values({ productId, published: true, createdAt: now(), updatedAt: now() })
    .onConflictDoUpdate({ target: [channelProducts.storeId, channelProducts.productId], set: { published: true, updatedAt: now() } });
}

async function applyProduct(db: AppDb, copy: AventyProductCopy): Promise<boolean> {
  const existing = await db.select({ id: products.id, sourceVersion: products.sourceVersion }).from(products)
    .where(eq(products.aventyId, copy.id)).then(first);
  if (existing && existing.sourceVersion !== null && existing.sourceVersion >= copy.version) {
    await publishInChannel(db, existing.id);
    return false;
  }

  const fields = {
    name: copy.name,
    description: copy.description,
    descriptionFormat: "text" as const,
    price: copy.price,
    compareAtPrice: copy.compareAtPrice,
    hasVariants: copy.variants.length > 0,
    variantOptions: variantOptions(copy),
    sku: copy.variants.length > 0 ? null : copy.sku,
    inventory: copy.variants.length > 0 ? 0 : copy.reserve,
    categoryId: await categoryId(db, copy.category),
    status: "ACTIVE" as const,
    visibility: true,
    deletedAt: null,
    sourceVersion: copy.version,
    updatedAt: now(),
  };
  let productId: string;
  if (existing) {
    productId = existing.id;
    await db.update(products).set(fields).where(eq(products.id, productId));
  } else {
    productId = randomUUID();
    await db.insert(products).values({ ...fields, id: productId, aventyId: copy.id, handle: handleOf(copy), publishedAt: now(), createdAt: now() });
  }

  const skus = copy.variants.map((v) => v.sku);
  const current = await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants).where(eq(productVariants.productId, productId));
  const bySku = new Map(current.map((v) => [v.sku, v.id]));
  for (const [index, variant] of copy.variants.entries()) {
    const values = {
      variations: JSON.stringify(variant.options),
      price: variant.price ?? copy.price,
      inventory: variant.reserve,
      active: true,
      isDefault: index === 0,
      position: index + 1,
      updatedAt: now(),
    };
    const id = bySku.get(variant.sku);
    if (id) await db.update(productVariants).set(values).where(eq(productVariants.id, id));
    else await db.insert(productVariants).values({ ...values, id: randomUUID(), productId, sku: variant.sku, createdAt: now() });
  }
  await db.update(productVariants).set({ active: false, updatedAt: now() })
    .where(skus.length > 0
      ? and(eq(productVariants.productId, productId), notInArray(productVariants.sku, skus))
      : eq(productVariants.productId, productId));

  await db.delete(productImages).where(eq(productImages.productId, productId));
  if (copy.images.length > 0) {
    await db.insert(productImages).values(copy.images.map((src, index) => ({
      id: randomUUID(), productId, src, position: index + 1, createdAt: now(), updatedAt: now(),
    })));
  }

  await publishInChannel(db, productId);
  return true;
}

async function unpublish(db: AppDb, aventyIds: string[] | "all-but", keep: string[] = []): Promise<number> {
  const scope = aventyIds === "all-but"
    ? keep.length > 0 ? and(isNotNull(products.aventyId), notInArray(products.aventyId, keep)) : isNotNull(products.aventyId)
    : aventyIds.length > 0 ? inArray(products.aventyId, aventyIds) : sql`false`;
  const ids = (await db.select({ id: products.id }).from(products).where(scope)).map((p) => p.id);
  if (ids.length === 0) return 0;
  const changed = await db.update(channelProducts).set({ published: false, updatedAt: now() })
    .where(and(inArray(channelProducts.productId, ids), eq(channelProducts.published, true)))
    .returning({ productId: channelProducts.productId });
  return changed.length;
}

export async function applyCatalogueCopies(db: AppDb, copies: AventyProductCopy[]): Promise<number> {
  let applied = 0;
  for (const copy of copies) if (await applyProduct(db, copy)) applied++;
  return applied;
}

export function unpublishWithdrawn(db: AppDb, removed: string[]): Promise<number> {
  return unpublish(db, removed);
}

export function unpublishAllBut(db: AppDb, listed: string[]): Promise<number> {
  return unpublish(db, "all-but", listed);
}

export async function applyDeliveryGrid(db: AppDb, storeId: string, grid: AventyDeliveryGrid): Promise<boolean> {
  const existing = await db.select({ id: shippingProfiles.id, sourceVersion: shippingProfiles.sourceVersion }).from(shippingProfiles)
    .where(eq(shippingProfiles.aventyStoreId, storeId)).then(first);
  if (existing && existing.sourceVersion !== null && existing.sourceVersion >= grid.version) return false;

  let profileId: string;
  if (existing) {
    profileId = existing.id;
    await db.update(shippingProfiles).set({ sourceVersion: grid.version, updatedAt: now() }).where(eq(shippingProfiles.id, profileId));
    await db.delete(shippingRules).where(eq(shippingRules.profileId, profileId));
  } else {
    profileId = randomUUID();
    const store = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, storeId)).then(first);
    await db.insert(shippingProfiles).values({
      id: profileId, name: `Aventy — ${store?.name ?? storeId}`, aventyStoreId: storeId, sourceVersion: grid.version, createdAt: now(), updatedAt: now(),
    });
  }
  if (grid.rules.length > 0) {
    await db.insert(shippingRules).values(grid.rules.map((rule) => ({
      id: randomUUID(),
      profileId,
      wilayaId: rule.wilayaId,
      homePrice: rule.home ?? 0,
      stopDeskPrice: rule.stopDesk ?? 0,
      homeEnabled: rule.home !== null,
      stopDeskEnabled: rule.stopDesk !== null,
      createdAt: now(),
    })));
  }
  await db.update(stores).set({ defaultShippingProfileId: profileId }).where(eq(stores.id, storeId));
  return true;
}
