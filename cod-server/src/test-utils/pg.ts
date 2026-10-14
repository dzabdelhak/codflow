/**
 * A real PostgreSQL database for tests.
 *
 * The migrations run once into a template database (named after a hash of the
 * migration files, so a schema change builds a new one); every caller then
 * gets its own copy (`CREATE DATABASE … TEMPLATE …`), with one store created
 * and the handle pinned to it exactly as a request would be: role
 * `codflow_app`, Row-Level Security on.
 *
 * Needs a reachable PostgreSQL: `docker compose up -d db` at the repo root, or
 * TEST_DATABASE_URL pointing at a server whose user may create databases and
 * roles. Register `dispose` in afterAll.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "../../../cod-shared/db/client";
import { stores } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import "@/db/scope";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://codflow:codflow@localhost:5440/codflow";
const MIGRATIONS_DIR = resolve(__dirname, "../db/migrations");

export const TEST_STORE_ID = "test-store";
export const TEST_MERCHANT_ID = "test-merchant";

function urlFor(database: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

function templateName(): string {
  const hash = createHash("sha256");
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    hash.update(readFileSync(`${MIGRATIONS_DIR}/${file}`));
  }
  hash.update(readFileSync(resolve(__dirname, "../db/seed/geo.sql")));
  return `codflow_template_${hash.digest("hex").slice(0, 12)}`;
}

let templateReady: Promise<string> | undefined;

/** Builds the template once per process; an advisory lock serialises workers. */
function ensureTemplate(): Promise<string> {
  templateReady ??= (async () => {
    const name = templateName();
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    try {
      await admin.query("select pg_advisory_lock(424242)");
      const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [name]);
      if (!rowCount) {
        const building = `${name}_building_${process.pid}`;
        await admin.query(`drop database if exists "${building}"`);
        await admin.query(`create database "${building}"`);
        await runMigrations(urlFor(building));
        await admin.query(`alter database "${building}" rename to "${name}"`);
      }
      return name;
    } finally {
      await admin.query("select pg_advisory_unlock(424242)").catch(() => {});
      await admin.end();
    }
  })();
  return templateReady;
}

export interface TestDb {
  /** Pinned to TEST_STORE_ID, as the app role. */
  db: AppDb;
  storeId: string;
  /** Connection string of this test's database (owner login). */
  url: string;
  /**
   * Another handle pinned to `storeId` — its own connection, for concurrency
   * tests. `failWhen` makes every statement it matches fail ("INJECTED FAULT"),
   * to prove a write rolls back whole.
   */
  connect(storeId?: string, opts?: { failWhen?: (sql: string) => boolean }): Promise<AppDb>;
  /** Creates a store (as the platform would) for `merchantId` (default: the test merchant) and returns its id. */
  createStore(id?: string, hostnames?: string[], merchantId?: string): Promise<string>;
  /** Creates a merchant and returns its id. */
  createMerchant(id?: string, storeLimit?: number | null): Promise<string>;
  /**
   * Resets the test's own store to a fresh row with these columns — what
   * single-store tests used to do by deleting and inserting a `stores` row,
   * which request code may no longer do. Any `id` is ignored; returns the id.
   */
  setStore(values: Partial<typeof stores.$inferInsert>): Promise<string>;
  /** Raw SQL as the platform role (bypasses RLS) — for fixtures and assertions. */
  platform: pg.Client;
  /**
   * Sees the text of every statement sent on the store connections (`db` and
   * `connect()`), for query-budget assertions. Pass undefined to stop.
   */
  recordQueries(listener: ((sql: string) => void) | undefined): void;
  dispose(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const template = await ensureTemplate();
  const database = `codflow_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database "${database}" template "${template}"`);
  await admin.end();

  const url = urlFor(database);
  const clients: pg.Client[] = [];

  async function open(role: "codflow_app" | "codflow_platform", storeId?: string, merchantId = TEST_MERCHANT_ID) {
    const client = new pg.Client({ connectionString: url });
    client.on("error", () => {});
    await client.connect();
    await client.query(`set role ${role}`);
    if (storeId) {
      await client.query("select set_config('app.store_id', $1, false)", [storeId]);
      await client.query("select set_config('app.merchant_id', $1, false)", [merchantId]);
    }
    clients.push(client);
    return client;
  }

  const platform = await open("codflow_platform");

  async function createMerchant(id = `merchant-${randomUUID().slice(0, 8)}`, storeLimit: number | null = null) {
    await platform.query(
      "insert into merchants (id, name, store_limit, created_at) values ($1, $2, $3, $4)",
      [id, `Merchant ${id}`, storeLimit, new Date().toISOString()],
    );
    return id;
  }

  async function createStore(
    id = `store-${randomUUID().slice(0, 8)}`,
    hostnames: string[] = [],
    merchantId = TEST_MERCHANT_ID,
  ) {
    const now = new Date().toISOString();
    await platform.query(
      "insert into stores (id, name, merchant_id, status, created_at, updated_at) values ($1, $2, $3, 'published', $4, $4)",
      [id, `Store ${id}`, merchantId, now],
    );
    for (const [index, hostname] of hostnames.entries()) {
      await platform.query(
        "insert into store_domains (hostname, store_id, kind, created_at, is_primary) values ($1, $2, 'subdomain', $3, $4)",
        [hostname, id, now, index === 0],
      );
    }
    return id;
  }

  await createMerchant(TEST_MERCHANT_ID);
  await createStore(TEST_STORE_ID);
  let queryListener: ((sql: string) => void) | undefined;
  const connect = async (storeId = TEST_STORE_ID, opts: { failWhen?: (sql: string) => boolean } = {}) => {
    const { rows } = await platform.query<{ merchant_id: string }>("select merchant_id from stores where id = $1", [storeId]);
    const client = await open("codflow_app", storeId, rows[0]?.merchant_id ?? TEST_MERCHANT_ID);
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as { query: unknown }).query = (...args: unknown[]) => {
      const first = args[0] as string | { text?: string };
      const text = typeof first === "string" ? first : first?.text ?? "";
      queryListener?.(text);
      if (opts.failWhen?.(text)) return Promise.reject(new Error("INJECTED FAULT"));
      return query(...args);
    };
    return getDb(client);
  };
  const db = await connect();

  /** Columns a fresh store row would take from their defaults (NULL when they have none). */
  const resettable = (
    await platform.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'stores' and table_schema = 'public'
          and column_name not in ('id', 'merchant_id', 'status')
          and (column_default is not null or is_nullable = 'YES')`,
    )
  ).rows.map((r) => `"${r.column_name}" = DEFAULT`);

  async function setStore(values: Partial<typeof stores.$inferInsert>) {
    await platform.query(`update stores set ${resettable.join(", ")}, status = 'published' where id = $1`, [TEST_STORE_ID]);
    const { id: _ignored, ...columns } = values;
    if (Object.keys(columns).length) await db.update(stores).set(columns).where(eq(stores.id, TEST_STORE_ID));
    return TEST_STORE_ID;
  }

  return {
    db,
    setStore,
    storeId: TEST_STORE_ID,
    url,
    connect,
    createStore,
    createMerchant,
    platform,
    recordQueries(listener) {
      queryListener = listener;
    },
    async dispose() {
      await Promise.all(clients.map((c) => c.end().catch(() => {})));
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists "${database}" with (force)`);
      await cleanup.end();
    },
  };
}
