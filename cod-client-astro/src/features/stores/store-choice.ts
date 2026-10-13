export interface MerchantStore {
  id: string;
  name: string;
  status: string;
  logoUrl: string | null;
  hostname: string | null;
}

/** The saved store when the merchant still owns it, otherwise the first one. */
export function pickActiveStore(stores: MerchantStore[], savedId: string | null): MerchantStore | null {
  return stores.find((store) => store.id === savedId) ?? stores[0] ?? null;
}

/** A subdomain for a store name: lower-case Latin letters, digits and single hyphens, at most 40. */
export function suggestSubdomain(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** The domain free subdomains live on, read off an existing store; null until one has a hostname. */
export function baseDomainOf(stores: MerchantStore[]): string | null {
  const hostname = stores.find((store) => store.hostname)?.hostname;
  return hostname ? hostname.slice(hostname.indexOf(".") + 1) : null;
}
