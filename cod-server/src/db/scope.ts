/**
 * Database access on the self-hosted platform (ADR-0003).
 *
 * Two pools on one database:
 *   app      — request code. Runs as `codflow_app`, so Row-Level Security
 *              confines it to the store set on its transaction.
 *   platform — platform code (routing, schedulers, cross-store jobs). Runs as
 *              `codflow_platform`, which bypasses RLS.
 *
 * A request gets ONE connection inside ONE transaction pinned to its store;
 * the transaction commits only when the handler succeeded.
 */
import pg from "pg";
import type { Context, Next } from "hono";
import { getDb, type AppDb } from "../../../cod-shared/db/client";
import type { AppContext } from "@/types";

// D1 returned COUNT/SUM/AVG as numbers; node-postgres returns bigint and
// numeric as strings. Store amounts are DZD, far inside 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, parseFloat);

export type DbRole = "codflow_app" | "codflow_platform";

export interface Database {
  app: pg.Pool;
  platform: pg.Pool;
  close(): Promise<void>;
}

export function createPool(connectionString: string, role: DbRole, max = 10): pg.Pool {
  // The role is a startup parameter, so it is in force before the first query.
  const pool = new pg.Pool({ connectionString, max, options: `-c role=${role}` });
  pool.on("connect", (client) => {
    client.on("error", (err) => console.error(`[db:${role}] connection error:`, err.message));
  });
  pool.on("error", (err) => console.error(`[db:${role}] idle client error:`, err.message));
  return pool;
}

export function createDatabase(connectionString: string): Database {
  const app = createPool(connectionString, "codflow_app", 20);
  const platform = createPool(connectionString, "codflow_platform", 5);
  return { app, platform, close: async () => void (await Promise.all([app.end(), platform.end()])) };
}

/** Run `fn` on one connection, in one transaction, pinned to `storeId`. */
export async function withStore<T>(pool: pg.Pool, storeId: string | null, fn: (db: AppDb) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (storeId) await client.query("select set_config('app.store_id', $1, true)", [storeId]);
    const result = await fn(getDb(client, { inTransaction: true }));
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** A store's id for a hostname, or null. Platform routing, so no store is set yet. */
export async function storeIdForHost(pool: pg.Pool, hostname: string): Promise<string | null> {
  const { rows } = await pool.query<{ store_id: string }>(
    "select store_id from store_domains where hostname = $1",
    [hostname.split(":")[0].toLowerCase()],
  );
  return rows[0]?.store_id ?? null;
}

/**
 * Until accounts and the channel selector land (ticket 03), non-storefront
 * routes (dashboard API, webhooks, OAuth) serve the deployment's only store.
 * With several stores and no selector, they get no store — RLS then shows
 * nothing rather than guessing.
 */
export async function soleStoreId(pool: pg.Pool): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>("select id from stores limit 2");
  return rows.length === 1 ? rows[0].id : null;
}

type ResolveStore = (c: Context<AppContext>) => Promise<string | null | Response>;

/**
 * Opens the request's transaction. `resolve` returns the store id, or a
 * Response to answer immediately (unknown host, bad credentials).
 * Commits unless the handler threw or answered 5xx.
 */
export function requestScope(resolve: ResolveStore) {
  return async (c: Context<AppContext>, next: Next) => {
    const resolved = await resolve(c);
    if (resolved instanceof Response) return resolved;

    const client = await c.env.DATABASE.app.connect();
    try {
      await client.query("begin");
      if (resolved) {
        await client.query("select set_config('app.store_id', $1, true)", [resolved]);
        c.set("storeId", resolved);
      }
      c.set("db", getDb(client, { inTransaction: true }));
      await next();
      await client.query(c.error || c.res.status >= 500 ? "rollback" : "commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
}
