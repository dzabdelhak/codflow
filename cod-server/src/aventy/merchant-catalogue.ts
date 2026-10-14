import { randomUUID } from "node:crypto";
import type pg from "pg";
import { withStore } from "@/db/scope";
import type { AppDb } from "../../../cod-shared/db/client";
import { first } from "../../../cod-shared/db/client";
import { shippingProfiles, shippingRules } from "../../../cod-shared/db/schema";
import type { AventyClient, AventyDeliveryGrid } from "./client";
import { applyCatalogueCopies } from "./apply";

export type MerchantCatalogueImport = { linked: false } | { linked: true; listed: number; applied: number };

const AVENTY_MERCHANT = /^aventy-(.+)$/;

async function seedDeliveryGrid(db: AppDb, grid: AventyDeliveryGrid) {
  if (await db.select({ id: shippingProfiles.id }).from(shippingProfiles).limit(1).then(first)) return;
  const now = new Date().toISOString();
  const profileId = randomUUID();
  await db.insert(shippingProfiles).values({ id: profileId, name: "Aventy", isDefault: true, createdAt: now, updatedAt: now });
  if (grid.rules.length === 0) return;
  await db.insert(shippingRules).values(grid.rules.map((rule) => ({
    id: randomUUID(),
    profileId,
    wilayaId: rule.wilayaId,
    homePrice: rule.home ?? 0,
    stopDeskPrice: rule.stopDesk ?? 0,
    homeEnabled: rule.home !== null,
    stopDeskEnabled: rule.stopDesk !== null,
    createdAt: now,
  })));
}

export async function importMerchantCatalogue(app: pg.Pool, client: AventyClient | null, merchantId: string): Promise<MerchantCatalogueImport> {
  const ref = AVENTY_MERCHANT.exec(merchantId)?.[1];
  if (!ref || !client) return { linked: false };
  const [{ products }, { grid }] = await Promise.all([client.catalogueSnapshot(ref), client.deliveryGrid(ref)]);
  const applied = await withStore(app, null, async (db) => {
    const count = await applyCatalogueCopies(db, products, { publish: false });
    await seedDeliveryGrid(db, grid);
    return count;
  }, merchantId);
  return { linked: true, listed: products.length, applied };
}
