/**
 * A merchant's stores — platform code: it runs on the platform pool (outside
 * Row-Level Security) and filters by merchant explicitly.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { getDb } from "../../../cod-shared/db/client";
import { seedStorePages } from "../../../cod-shared/queries/store-pages";
import type { PlanPolicy } from "./plan-policy";

export interface MerchantStore {
  id: string;
  name: string;
  status: string;
  logoUrl: string | null;
  /** The store's free subdomain, or its first hostname; null when it has none. */
  hostname: string | null;
}

const RESERVED_SUBDOMAINS = new Set(["www", "api", "app", "admin", "dashboard", "mail", "static", "cdn", "assets"]);
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normaliseSubdomain(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return SUBDOMAIN.test(value) && !RESERVED_SUBDOMAINS.has(value) ? value : null;
}

export async function listMerchantStores(platform: pg.Pool, merchantId: string): Promise<MerchantStore[]> {
  const { rows } = await platform.query<MerchantStore>(
    `select s.id, s.name, s.status, s.logo_url as "logoUrl",
            (select d.hostname from store_domains d where d.store_id = s.id
              order by (d.kind = 'subdomain') desc, d.created_at limit 1) as hostname
       from stores s
      where s.merchant_id = $1
      order by s.created_at, s.id`,
    [merchantId],
  );
  return rows;
}

/** Does `storeId` belong to `merchantId`? */
export async function merchantOwnsStore(platform: pg.Pool, merchantId: string, storeId: string): Promise<boolean> {
  const { rowCount } = await platform.query("select 1 from stores where id = $1 and merchant_id = $2", [storeId, merchantId]);
  return rowCount === 1;
}

export type CreateStoreResult =
  | { ok: true; store: MerchantStore }
  | { ok: false; reason: "invalid_subdomain" }
  | { ok: false; reason: "subdomain_taken" }
  | { ok: false; reason: "plan_limit"; limit: number; used: number };

/**
 * Creates a store with its free subdomain and its four legal pages, in one
 * transaction: all of it exists, or none of it.
 */
export async function createMerchantStore(
  platform: pg.Pool,
  input: { merchantId: string; name: string; subdomain: string; baseDomain: string },
  policy: PlanPolicy,
): Promise<CreateStoreResult> {
  const subdomain = normaliseSubdomain(input.subdomain);
  if (!subdomain) return { ok: false, reason: "invalid_subdomain" };
  const hostname = `${subdomain}.${input.baseDomain}`;

  const client = await platform.connect();
  try {
    await client.query("begin");
    await client.query("select 1 from merchants where id = $1 for update", [input.merchantId]);

    const decision = await policy.canCreateStore(client, input.merchantId);
    if (!decision.allowed) {
      await client.query("rollback");
      return { ok: false, reason: "plan_limit", limit: decision.limit, used: decision.used };
    }

    const taken = await client.query("select 1 from store_domains where hostname = $1", [hostname]);
    if (taken.rowCount) {
      await client.query("rollback");
      return { ok: false, reason: "subdomain_taken" };
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await client.query(
      "insert into stores (id, name, merchant_id, created_at, updated_at) values ($1, $2, $3, $4, $4)",
      [id, input.name.trim(), input.merchantId, now],
    );
    await client.query(
      "insert into store_domains (hostname, store_id, kind, created_at) values ($1, $2, 'subdomain', $3)",
      [hostname, id, now],
    );
    // Store-owned rows take their store_id from the transaction's store.
    await client.query("select set_config('app.store_id', $1, true)", [id]);
    await seedStorePages(getDb(client, { inTransaction: true }), id);
    await client.query("commit");

    return { ok: true, store: { id, name: input.name.trim(), status: "active", logoUrl: null, hostname } };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    if ((err as { code?: string }).code === "23505") return { ok: false, reason: "subdomain_taken" };
    throw err;
  } finally {
    client.release();
  }
}
