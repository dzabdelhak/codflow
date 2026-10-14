import { sql } from "drizzle-orm";
import {
  channelDesigns,
  channelDesignVersions,
  landingPageImages,
  productCategories,
  productImages,
  products,
  stores,
  users,
} from "../db/schema";
import type { AppDb } from "../db/client";
import { imageKeysInText } from "../lib/orphan-images";

/**
 * Every stored image key still referenced by stored data.
 *
 * The reference sources are enumerated here, in one place, because a missed
 * source means the orphan sweep deletes live merchant media. Today:
 *
 *   1. `product_images.r2_key` and `src` — gallery records;
 *   2. `products.description` — inline images in rich descriptions;
 *   3. `product_categories.image_url` — category images;
 *   4. `landing_page_images.r2_key` and `src` — landing page stacks;
 *   5. `stores` logo, OG image, storefront content and WhatsApp widget
 *      (its avatar) — branding a channel shows today;
 *   6. design drafts and every published design version — a restorable
 *      version must still find its logo and section images;
 *   7. `users.image` — profile pictures.
 *
 * Soft-deleted products are included deliberately: restore must not find its
 * media already destroyed. A new uploader must add its column here (the sweep
 * test in `cod-server/src/cron/sweep-orphan-images.test.ts` guards the ones
 * that exist).
 *
 * Scanning is per-value and shape-agnostic (`imageKeysInText`), so a key is
 * protected whether it is stored bare or inside a URL.
 */
export async function collectReferencedImageKeys(db: AppDb): Promise<Set<string>> {
  const results = await Promise.all([
    db.select({ a: productImages.r2Key, b: productImages.src }).from(productImages),
    db.select({ a: products.description }).from(products),
    db.select({ a: productCategories.imageUrl }).from(productCategories),
    db.select({ a: landingPageImages.r2Key, b: landingPageImages.src }).from(landingPageImages),
    db
      .select({
        a: stores.logoUrl,
        b: stores.ogImage,
        c: stores.contentJson,
        d: stores.whatsappWidgetJson,
      })
      .from(stores),
    db.select({ a: sql<string | null>`${channelDesigns.draft}::text` }).from(channelDesigns),
    db.select({ a: sql<string>`${channelDesignVersions.document}::text` }).from(channelDesignVersions),
    db.select({ a: users.image }).from(users),
  ]);

  const keys = new Set<string>();
  for (const rows of results) {
    for (const row of rows as Array<Record<string, string | null | undefined>>) {
      for (const key of imageKeysInText(...Object.values(row))) keys.add(key);
    }
  }
  return keys;
}
