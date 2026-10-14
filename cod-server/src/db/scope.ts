/**
 * Request scope: a request gets ONE connection inside ONE transaction pinned
 * to its store (and merchant); it commits only when the handler succeeded.
 * The pools themselves live in cod-shared/db/pools.ts.
 */
import type pg from "pg";
import type { Context, Next } from "hono";
import { getDb } from "../../../cod-shared/db/client";
import type { AppContext } from "@/types";
import type { PublicChannel } from "../../../cod-shared/channels/lifecycle";

export { createPool, createDatabase, withStore, type Database, type DbRole } from "../../../cod-shared/db/pools";

export async function scopeForHost(
  platform: pg.Pool,
  hostname: string,
): Promise<(Scope & { channel: PublicChannel; primaryHostname: string | null }) | null> {
  const { rows } = await platform.query<{ store_id: string; merchant_id: string; primary_hostname: string | null } & PublicChannel>(
    `select d.store_id, s.merchant_id, s.status, s.channel_type as type, s.unavailable_rule as "unavailableRule",
            s.channel_type <> 'landing' or main_product_available(s.id) as "mainProductAvailable",
            (select p.hostname from store_domains p
              where p.store_id = s.id and p.is_primary and p.status = 'verified') as primary_hostname
       from store_domains d join stores s on s.id = d.store_id
      where d.hostname = $1 and d.status = 'verified'`,
    [hostname.split(":")[0].toLowerCase().replace(/\.$/, "")],
  );
  const row = rows[0];
  if (!row) return null;
  const { store_id, merchant_id, primary_hostname, ...channel } = row;
  return { storeId: store_id, merchantId: merchant_id, channel, primaryHostname: primary_hostname };
}

/**
 * Webhooks carry no user and no hostname yet: they serve the deployment's
 * only store, and none when there are several (RLS then shows nothing rather
 * than guessing). Their own ticket replaces this.
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
