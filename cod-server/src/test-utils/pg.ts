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
import { getDb, type AppDb } from "@/db";
import { stores } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import "@/db/scope";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://codflow:codflow@localhost:5440/codflow";
const MIGRATIONS_DIR = resolve(__dirname, "../db/migrations");

export const TEST_STORE_ID = "test-store";

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
  /** Another handle pinned to `storeId` — its own connection, for concurrency tests. */
  connect(storeId?: string): Promise<AppDb>;
  /** Creates a store (as the platform would) and returns its id. */
  createStore(id?: string, hostnames?: string[]): Promise<string>;
  /**
   * Sets columns on the test's own store — what single-store tests used to do
   * by inserting a `stores` row, which request code may no longer do. Any `id`
   * in `values` is ignored; returns the store id.
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

  async function open(role: "codflow_app" | "codflow_platform", storeId?: string) {
    const client = new pg.Client({ connectionString: url });
    client.on("error", () => {});
    await client.connect();
    await client.query(`set role ${role}`);
    if (storeId) await client.query("select set_config('app.store_id', $1, false)", [storeId]);
    clients.push(client);
    return client;
  }

  const platform = await open("codflow_platform");

  async function createStore(id = `store-${randomUUID().slice(0, 8)}`, hostnames: string[] = []) {
    const now = new Date().toISOString();
    await platform.query(
      "insert into stores (id, name, created_at, updated_at) values ($1, $2, $3, $3)",
      [id, `Store ${id}`, now],
    );
    for (const hostname of hostnames) {
      await platform.query(
        "insert into store_domains (hostname, store_id, kind, created_at) values ($1, $2, 'subdomain', $3)",
        [hostname, id, now],
      );
    }
    return id;
  }

  await createStore(TEST_STORE_ID);
  let queryListener: ((sql: string) => void) | undefined;
  const connect = async (storeId = TEST_STORE_ID) => {
    const client = await open("codflow_app", storeId);
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as { query: unknown }).query = (...args: unknown[]) => {
      const first = args[0] as string | { text?: string };
      queryListener?.(typeof first === "string" ? first : first?.text ?? "");
      return query(...args);
    };
    return getDb(client);
  };
  const db = await connect();

  async function setStore(values: Partial<typeof stores.$inferInsert>) {
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
