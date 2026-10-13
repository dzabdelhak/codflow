/**
 * Request scope: a request gets ONE connection inside ONE transaction pinned
 * to its store (and merchant); it commits only when the handler succeeded.
 * The pools themselves live in cod-shared/db/pools.ts.
 */
import type pg from "pg";
import type { Context, Next } from "hono";
import { getDb } from "../../../cod-shared/db/client";
import type { AppContext } from "@/types";
import type { ChannelStatus } from "../../../cod-shared/channels/lifecycle";

export { createPool, createDatabase, withStore, type Database, type DbRole } from "../../../cod-shared/db/pools";

export async function scopeForHost(
  platform: pg.Pool,
  hostname: string,
): Promise<(Scope & { status: ChannelStatus }) | null> {
  const { rows } = await platform.query<{ store_id: string; merchant_id: string; status: ChannelStatus }>(
    `select d.store_id, s.merchant_id, s.status from store_domains d join stores s on s.id = d.store_id
      where d.hostname = $1`,
    [hostname.split(":")[0].toLowerCase()],
  );
  return rows[0] ? { storeId: rows[0].store_id, merchantId: rows[0].merchant_id, status: rows[0].status } : null;
}

/**
 * Webhooks and image serving carry no user and no hostname yet: they serve
 * the deployment's only store, and none when there are several (RLS then
 * shows nothing rather than guessing). Their own tickets replace this.
 */
export async function soleStoreId(platform: pg.Pool): Promise<Scope> {
  const { rows } = await platform.query<{ id: string; merchant_id: string }>("select id, merchant_id from stores limit 2");
  return rows.length === 1 ? { storeId: rows[0].id, merchantId: rows[0].merchant_id } : { storeId: null };
}

/** The store (and, for dashboard requests, the merchant) a request works in. */
export interface Scope {
  storeId: string | null;
  merchantId?: string | null;
}

type ResolveScope = (c: Context<AppContext>) => Promise<Scope | Response>;

/**
 * Opens the request's transaction. `resolve` returns its scope, or a
 * Response to answer immediately (unknown host, bad credentials, a store the
 * user may not open). Commits unless the handler threw or answered 5xx.
 */
export function requestScope(resolve: ResolveScope) {
  return async (c: Context<AppContext>, next: Next) => {
    const scope = await resolve(c);
    if (scope instanceof Response) return scope;

    const client = await c.env.DATABASE.app.connect();
    try {
      await client.query("begin");
      if (scope.merchantId) {
        await client.query("select set_config('app.merchant_id', $1, true)", [scope.merchantId]);
      }
      if (scope.storeId) {
        await client.query("select set_config('app.store_id', $1, true)", [scope.storeId]);
        c.set("storeId", scope.storeId);
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
