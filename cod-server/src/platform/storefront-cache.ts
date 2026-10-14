import type { Env } from "@/types";

export async function purgeChannelPages(
  env: Pick<Env, "DATABASE" | "STOREFRONT_INTERNAL_URL" | "STOREFRONT_SERVICE_KEY">,
  storeId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!env.STOREFRONT_INTERNAL_URL || !env.STOREFRONT_SERVICE_KEY) return;
  const { rows } = await env.DATABASE.platform.query<{ hostname: string }>(
    "select hostname from store_domains where store_id = $1",
    [storeId],
  );
  if (rows.length === 0) return;
  try {
    const res = await fetcher(new URL("/api/channel-cache", env.STOREFRONT_INTERNAL_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Storefront-Key": env.STOREFRONT_SERVICE_KEY },
      body: JSON.stringify({ hostnames: rows.map((r) => r.hostname) }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) console.warn(`[storefront-cache] purge for ${storeId} answered ${res.status}`);
  } catch (err) {
    console.warn(`[storefront-cache] purge for ${storeId} failed`, err);
  }
}

export function schedulePurge(
  env: Pick<Env, "DATABASE" | "STOREFRONT_INTERNAL_URL" | "STOREFRONT_SERVICE_KEY">,
  storeId: string | undefined,
): void {
  if (!storeId) return;
  void purgeChannelPages(env, storeId).catch((err) => console.warn("[storefront-cache] purge failed", err));
}
