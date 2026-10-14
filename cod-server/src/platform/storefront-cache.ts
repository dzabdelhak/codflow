import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Env } from "@/types";

export type ResolveAll = (hostname: string) => Promise<string[]>;

const resolveAll: ResolveAll = async (hostname) => (await lookup(hostname, { all: true })).map((a) => a.address);

export async function storefrontInstances(configured: string, resolve: ResolveAll = resolveAll): Promise<URL[]> {
  const urls = configured.split(",").map((u) => u.trim()).filter(Boolean).map((u) => new URL(u));
  const instances = await Promise.all(
    urls.map(async (url) => {
      if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) return [url];
      const addresses = await resolve(url.hostname).catch(() => [] as string[]);
      if (addresses.length === 0) return [url];
      return addresses.map((address) => {
        const instance = new URL(url);
        instance.hostname = isIP(address) === 6 ? `[${address}]` : address;
        return instance;
      });
    }),
  );
  return [...new Map(instances.flat().map((u) => [u.href, u])).values()];
}

export async function purgeChannelPages(
  env: Pick<Env, "DATABASE" | "STOREFRONT_INTERNAL_URL" | "STOREFRONT_SERVICE_KEY">,
  storeId: string,
  fetcher: typeof fetch = fetch,
  resolve: ResolveAll = resolveAll,
): Promise<void> {
  if (!env.STOREFRONT_INTERNAL_URL || !env.STOREFRONT_SERVICE_KEY) return;
  const { rows } = await env.DATABASE.platform.query<{ hostname: string }>(
    "select hostname from store_domains where store_id = $1",
    [storeId],
  );
  if (rows.length === 0) return;
  const body = JSON.stringify({ hostnames: rows.map((r) => r.hostname) });
  const instances = await storefrontInstances(env.STOREFRONT_INTERNAL_URL, resolve);
  await Promise.all(
    instances.map(async (instance) => {
      try {
        const res = await fetcher(new URL("/api/channel-cache", instance), {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Storefront-Key": env.STOREFRONT_SERVICE_KEY! },
          body,
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) console.warn(`[storefront-cache] purge for ${storeId} at ${instance.host} answered ${res.status}`);
      } catch (err) {
        console.warn(`[storefront-cache] purge for ${storeId} at ${instance.host} failed`, err);
      }
    }),
  );
}

export async function purgeProductChannels(
  env: Pick<Env, "DATABASE" | "STOREFRONT_INTERNAL_URL" | "STOREFRONT_SERVICE_KEY">,
  productId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!env.STOREFRONT_INTERNAL_URL || !env.STOREFRONT_SERVICE_KEY) return;
  const { rows } = await env.DATABASE.platform.query<{ store_id: string }>(
    "select store_id from channel_products where product_id = $1",
    [productId],
  );
  await Promise.all(rows.map((r) => purgeChannelPages(env, r.store_id, fetcher)));
}

export function schedulePurgeForProduct(
  env: Pick<Env, "DATABASE" | "STOREFRONT_INTERNAL_URL" | "STOREFRONT_SERVICE_KEY">,
  productId: string,
): void {
  void purgeProductChannels(env, productId).catch((err) => console.warn("[storefront-cache] purge failed", err));
}

export function schedulePurge(
  env: Pick<Env, "DATABASE" | "STOREFRONT_INTERNAL_URL" | "STOREFRONT_SERVICE_KEY">,
  storeId: string | undefined,
): void {
  if (!storeId) return;
  void purgeChannelPages(env, storeId).catch((err) => console.warn("[storefront-cache] purge failed", err));
}
