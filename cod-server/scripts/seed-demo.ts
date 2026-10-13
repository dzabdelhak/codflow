/**
 * Two demo channels for local development — shop1.localhost and
 * shop2.localhost — each with its own products and a delivery rule for
 * Algiers. Idempotent: a channel that already exists is left alone.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/seed-demo.ts
 */
import { sql } from "drizzle-orm";
import { createDatabase, withStore } from "../src/db/scope";
import { products, productVariants, shippingProfiles, shippingRules } from "../src/db/schema";

const CHANNELS = [
  { id: "demo-shop1", name: "Shop 1", host: "shop1.localhost", items: ["Sac à main", "Montre"] },
  { id: "demo-shop2", name: "Shop 2", host: "shop2.localhost", items: ["Basket blanche", "Casquette"] },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const database = createDatabase(url);
  const now = new Date().toISOString();

  try {
    for (const channel of CHANNELS) {
      const { rowCount } = await database.platform.query("select 1 from stores where id = $1", [channel.id]);
      if (rowCount) {
        console.log(`${channel.host}: already seeded`);
        continue;
      }
      await database.platform.query(
        "insert into stores (id, name, created_at, updated_at) values ($1, $2, $3, $3)",
        [channel.id, channel.name, now],
      );
      await database.platform.query(
        "insert into store_domains (hostname, store_id, kind, created_at) values ($1, $2, 'subdomain', $3)",
        [channel.host, channel.id, now],
      );

      await withStore(database.app, channel.id, async (db) => {
        const profileId = `${channel.id}-profile`;
        await db.insert(shippingProfiles).values({ id: profileId, name: "Défaut", isDefault: true, createdAt: now, updatedAt: now });
        await db.insert(shippingRules).values({
          id: `${channel.id}-rule-16`,
          profileId,
          wilayaId: 16,
          homePrice: 400,
          stopDeskPrice: 250,
          homeEnabled: true,
          stopDeskEnabled: true,
          createdAt: now,
        });
        for (const [i, name] of channel.items.entries()) {
          const id = `${channel.id}-p${i + 1}`;
          await db.insert(products).values({
            id,
            name,
            handle: `produit-${i + 1}`,
            price: 2500 + i * 1500,
            sku: `${channel.id.toUpperCase()}-${i + 1}`,
            inventory: 50,
            storeFeatured: i === 0,
            createdAt: now,
            updatedAt: now,
          });
        }
        await db.update(products).set({ hasVariants: true }).where(sql`id = ${`${channel.id}-p2`}`);
        await db.insert(productVariants).values(
          ["Noir", "Blanc"].map((color, i) => ({
            id: `${channel.id}-p2-v${i + 1}`,
            productId: `${channel.id}-p2`,
            variations: JSON.stringify({ Couleur: color }),
            price: 4000,
            sku: `${channel.id.toUpperCase()}-2-${color.toUpperCase()}`,
            inventory: 20,
            position: i,
            createdAt: now,
            updatedAt: now,
          })),
        );
      });
      console.log(`${channel.host}: seeded`);
    }
  } finally {
    await database.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
