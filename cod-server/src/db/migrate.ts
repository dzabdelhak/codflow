/**
 * Applies the PostgreSQL migrations, then the reference data (wilayas and
 * communes) when it is missing. Idempotent; safe to run on every deploy.
 *
 *   DATABASE_URL=postgres://… npx tsx src/db/migrate.ts
 *
 * Runs as the database owner (a superuser on first run: the multi-store
 * migration creates the BYPASSRLS platform role).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const here = (path: string) => resolve(import.meta.dirname, path);

export async function runMigrations(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: here("migrations") });
    const { rows } = await client.query<{ n: number }>("select count(*)::int as n from communes");
    if (rows[0].n === 0) {
      await client.query("begin");
      try {
        await client.query("delete from wilayas");
        await client.query(readFileSync(here("seed/geo.sql"), "utf8"));
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  runMigrations(url).then(
    () => console.log("migrations applied"),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
