import { Resolver } from "node:dns/promises";
import { domainToASCII } from "node:url";
import type pg from "pg";

export type DomainStatus = "pending" | "verified" | "failed";

export interface ChannelDomain {
  hostname: string;
  kind: "subdomain" | "custom";
  status: DomainStatus;
  isPrimary: boolean;
  createdAt: string;
  verifiedAt: string | null;
  checkedAt: string | null;
  lastError: string | null;
}

export interface DnsLookup {
  cname(hostname: string): Promise<string[]>;
  a(hostname: string): Promise<string[]>;
}

export interface DomainTargets {
  cname: string | null;
  ipv4: string[];
}

export const MAX_DOMAINS_PER_CHANNEL = 10;
export const PENDING_CLAIM_TTL_MS = 72 * 60 * 60 * 1000;
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

export function systemDns(servers?: string[]): DnsLookup {
  const resolver = new Resolver({ timeout: 4000, tries: 2 });
  if (servers?.length) resolver.setServers(servers);
  return {
    cname: (hostname) => resolver.resolveCname(hostname),
    a: (hostname) => resolver.resolve4(hostname),
  };
}

export function domainTargets(env: { CUSTOM_DOMAIN_TARGET?: string; CUSTOM_DOMAIN_IPV4?: string }): DomainTargets {
  return {
    cname: env.CUSTOM_DOMAIN_TARGET?.trim().toLowerCase().replace(/\.$/, "") || null,
    ipv4: (env.CUSTOM_DOMAIN_IPV4 ?? "").split(",").map((ip) => ip.trim()).filter(Boolean),
  };
}

export function normaliseDomain(raw: string, baseDomain: string): string | null {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  const ascii = domainToASCII(value);
  if (!ascii || !HOSTNAME.test(ascii)) return null;
  const base = baseDomain.toLowerCase();
  if (ascii === base || ascii.endsWith(`.${base}`)) return null;
  return ascii;
}

const COLUMNS = `hostname, kind, status, is_primary as "isPrimary", created_at as "createdAt",
  verified_at as "verifiedAt", checked_at as "checkedAt", last_error as "lastError"`;

export async function listChannelDomains(platform: pg.Pool, storeId: string): Promise<ChannelDomain[]> {
  const { rows } = await platform.query<ChannelDomain>(
    `select ${COLUMNS} from store_domains where store_id = $1 order by is_primary desc, (kind = 'subdomain') desc, created_at, hostname`,
    [storeId],
  );
  return rows;
}

export type AddDomainResult =
  | { ok: true; domain: ChannelDomain }
  | { ok: false; reason: "invalid" | "taken" | "already_added" | "limit" };

export async function addChannelDomain(
  platform: pg.Pool,
  storeId: string,
  raw: string,
  baseDomain: string,
  now = new Date(),
): Promise<AddDomainResult> {
  const hostname = normaliseDomain(raw, baseDomain);
  if (!hostname) return { ok: false, reason: "invalid" };
  const client = await platform.connect();
  try {
    await client.query("begin");
    await client.query("select 1 from stores where id = $1 for no key update", [storeId]);
    const { rows: [existing] } = await client.query<{ store_id: string; status: DomainStatus; created_at: string }>(
      "select store_id, status, created_at from store_domains where hostname = $1 for update",
      [hostname],
    );
    if (existing?.store_id === storeId) {
      await client.query("rollback");
      return { ok: false, reason: "already_added" };
    }
    if (existing) {
      const stale = existing.status !== "verified" && now.getTime() - Date.parse(existing.created_at) > PENDING_CLAIM_TTL_MS;
      if (!stale) {
        await client.query("rollback");
        return { ok: false, reason: "taken" };
      }
      await client.query("delete from store_domains where hostname = $1", [hostname]);
    }
    const { rows: [count] } = await client.query<{ n: number }>(
      "select count(*)::int as n from store_domains where store_id = $1 and kind = 'custom'",
      [storeId],
    );
    if (count.n >= MAX_DOMAINS_PER_CHANNEL) {
      await client.query("rollback");
      return { ok: false, reason: "limit" };
    }
    const { rows: [domain] } = await client.query<ChannelDomain>(
      `insert into store_domains (hostname, store_id, kind, created_at, status, is_primary)
       values ($1, $2, 'custom', $3, 'pending', false) returning ${COLUMNS}`,
      [hostname, storeId, now.toISOString()],
    );
    await client.query("commit");
    return { ok: true, domain };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    if ((err as { code?: string }).code === "23505") return { ok: false, reason: "taken" };
    throw err;
  } finally {
    client.release();
  }
}

export type DnsCheck = { ok: true } | { ok: false; error: string };

export async function checkDomainDns(hostname: string, dns: DnsLookup, targets: DomainTargets): Promise<DnsCheck> {
  if (!targets.cname && targets.ipv4.length === 0) return { ok: false, error: "platform_target_not_configured" };
  const safe = (lookup: Promise<string[]>) =>
    lookup.then(
      (values) => ({ values, failed: false }),
      (err: { code?: string }) => ({ values: [] as string[], failed: !["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes(err.code ?? "") }),
    );
  const cname = await safe(dns.cname(hostname));
  const pointsTo = cname.values.map((value) => value.toLowerCase().replace(/\.$/, ""));
  if (targets.cname && pointsTo.includes(targets.cname)) return { ok: true };

  const a = await safe(dns.a(hostname));
  const allowed = new Set(targets.ipv4);
  if (targets.cname && a.values.length > 0) {
    for (const ip of (await safe(dns.a(targets.cname))).values) allowed.add(ip);
  }
  if (a.values.some((ip) => allowed.has(ip))) return { ok: true };
  if (cname.failed || a.failed) return { ok: false, error: "dns_lookup_failed" };
  const found = [...pointsTo, ...a.values];
  return found.length === 0 ? { ok: false, error: "no_dns_records" } : { ok: false, error: `points_elsewhere:${found.join(",")}` };
}

export type VerifyResult = { ok: true; domain: ChannelDomain } | { ok: false; reason: "not_found" };

export async function verifyChannelDomain(
  platform: pg.Pool,
  storeId: string,
  hostname: string,
  dns: DnsLookup,
  targets: DomainTargets,
  now = new Date(),
): Promise<VerifyResult> {
  const { rows: [row] } = await platform.query<{ kind: string }>(
    "select kind from store_domains where hostname = $1 and store_id = $2",
    [hostname, storeId],
  );
  if (!row) return { ok: false, reason: "not_found" };
  if (row.kind === "subdomain") {
    return { ok: true, domain: (await listChannelDomains(platform, storeId)).find((d) => d.hostname === hostname)! };
  }
  const check = await checkDomainDns(hostname, dns, targets);
  const at = now.toISOString();
  const { rows: [domain] } = await platform.query<ChannelDomain>(
    `update store_domains
        set status = $3, checked_at = $4, last_error = $5,
            verified_at = case when $3 = 'verified' then coalesce(verified_at, $4) else verified_at end
      where hostname = $1 and store_id = $2
      returning ${COLUMNS}`,
    [hostname, storeId, check.ok ? "verified" : "failed", at, check.ok ? null : check.error],
  );
  return { ok: true, domain };
}

export type PrimaryResult = { ok: true } | { ok: false; reason: "not_found" | "not_verified" };

export async function setPrimaryDomain(platform: pg.Pool, storeId: string, hostname: string): Promise<PrimaryResult> {
  const client = await platform.connect();
  try {
    await client.query("begin");
    const { rows: [row] } = await client.query<{ status: DomainStatus; kind: string }>(
      "select status, kind from store_domains where hostname = $1 and store_id = $2 for update",
      [hostname, storeId],
    );
    if (!row || row.status !== "verified") {
      await client.query("rollback");
      return { ok: false, reason: row ? "not_verified" : "not_found" };
    }
    await client.query("update store_domains set is_primary = false where store_id = $1 and is_primary", [storeId]);
    await client.query("update store_domains set is_primary = true where hostname = $1", [hostname]);
    await client.query("update stores set domain = $2, updated_at = $3 where id = $1", [
      storeId,
      row.kind === "custom" ? hostname : null,
      new Date().toISOString(),
    ]);
    await client.query("commit");
    return { ok: true };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export type RemoveResult = { ok: true } | { ok: false; reason: "not_found" | "is_subdomain" | "is_primary" };

export async function removeChannelDomain(platform: pg.Pool, storeId: string, hostname: string): Promise<RemoveResult> {
  const { rows: [row] } = await platform.query<{ kind: string; is_primary: boolean }>(
    "select kind, is_primary from store_domains where hostname = $1 and store_id = $2",
    [hostname, storeId],
  );
  if (!row) return { ok: false, reason: "not_found" };
  if (row.kind === "subdomain") return { ok: false, reason: "is_subdomain" };
  if (row.is_primary) return { ok: false, reason: "is_primary" };
  await platform.query("delete from store_domains where hostname = $1 and store_id = $2", [hostname, storeId]);
  return { ok: true };
}

export async function certificateAllowed(platform: pg.Pool, hostname: string): Promise<boolean> {
  const { rowCount } = await platform.query(
    `select 1 from store_domains d join stores s on s.id = d.store_id
      where d.hostname = $1 and d.status = 'verified' and s.status <> 'archived'`,
    [hostname.toLowerCase().replace(/\.$/, "")],
  );
  return rowCount === 1;
}
