import type { ChannelStatus } from "../../../../cod-shared/channels/lifecycle";
import type { ChannelType } from "../../../../cod-shared/channels/types";

export interface MerchantStore {
  id: string;
  name: string;
  type: ChannelType;
  status: ChannelStatus;
  logoUrl: string | null;
  hostname: string | null;
  hasOrders: boolean;
  createdAt: string;
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

export function filterStores(stores: MerchantStore[], query: string, status: ChannelStatus | "all"): MerchantStore[] {
  const needle = query.trim().toLocaleLowerCase();
  return stores.filter(
    (store) =>
      (status === "all" || store.status === status) &&
      (!needle || store.name.toLocaleLowerCase().includes(needle) || (store.hostname ?? "").includes(needle)),
  );
}

export function canDeleteStore(store: MerchantStore, stores: MerchantStore[]): boolean {
  return store.status === "archived" && !store.hasOrders && stores.length > 1;
}
