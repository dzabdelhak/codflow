/**
 * Seeds a store's four legal pages (Terms, Privacy, Refund, Shipping) —
 * report-md/LEGAL_PAGES_PLAN.md. Without them, Meta Ads rejects the
 * storefront for missing policy pages.
 *
 * Runs the app's own `seedStorePages` (same templates, same sanitiser, same
 * write chokepoint), pinned to each store exactly as a request would be.
 * Idempotent: a store that already has its pages is left alone.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/seed-store-pages.ts                # every store
 *   DATABASE_URL=postgres://… npx tsx scripts/seed-store-pages.ts --store-id=abc
 */
import { createDatabase, withStore } from "../src/db/scope";
import { seedStorePages } from "../../cod-shared/queries/store-pages";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const only = process.argv.find((arg) => arg.startsWith("--store-id="))?.slice("--store-id=".length);

  const database = createDatabase(url);
  try {
    const { rows } = only
      ? await database.platform.query<{ id: string }>("select id from stores where id = $1", [only])
      : await database.platform.query<{ id: string }>("select id from stores order by id");
    if (only && rows.length === 0) throw new Error(`no store with id ${only}`);

    for (const { id } of rows) {
      const { created } = await withStore(database.app, id, (db) => seedStorePages(db, id));
      console.log(`${id}: ${created.length ? `created ${created.join(", ")}` : "already had its legal pages"}`);
    }
  } finally {
    await database.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
