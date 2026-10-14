import type { AventyDomain } from "../../../cod-shared/db/schema";
import type { DestinationAnswer } from "@/platform/outbound/destination";
import {
  AventyPermissionError,
  AventyUnauthorizedError,
  type AventyClient,
  type AventyDeliveryGrid,
  type AventyProductCopy,
} from "@/aventy/client";

interface FakeSite {
  revoked: boolean;
  denied: Set<AventyDomain | "orders">;
  products: Map<string, AventyProductCopy>;
  log: Array<{ seq: number; id: string; removed: boolean }>;
  seq: number;
  expiredBefore: number;
  grid: AventyDeliveryGrid;
  changed: Set<AventyDomain>;
  orders: Map<string, { remoteId: string; payload: unknown }>;
  answers: DestinationAnswer[];
  failWith: Error | null;
}

export function product(id: string, version: number, overrides: Partial<AventyProductCopy> = {}): AventyProductCopy {
  return {
    id, version, name: `Produit ${id}`, description: null, price: 2500, compareAtPrice: null,
    category: { id: "cat-1", name: "Montres" }, images: [`https://cdn.aventy.test/${id}/1.webp`],
    sku: `SKU-${id}`, reserve: 5, variants: [], ...overrides,
  };
}

export function fakeAventy() {
  const sites = new Map<string, FakeSite>();
  let remoteSeq = 0;
  const calls: Array<{ key: string; method: string }> = [];

  const site = (key: string) => {
    calls.push({ key, method: "lookup" });
    const s = sites.get(key);
    if (!s || s.revoked) throw new AventyUnauthorizedError(`key ${key} refused`);
    return s;
  };
  const allowed = (s: FakeSite, domain: AventyDomain | "orders") => {
    if (s.denied.has(domain)) throw new AventyPermissionError(domain);
  };

  const client: AventyClient = {
    async heartbeat(key) {
      const s = site(key);
      calls.push({ key, method: "heartbeat" });
      return { changed: [...s.changed] };
    },
    async catalogueSnapshot(key) {
      const s = site(key);
      allowed(s, "catalogue");
      if (s.failWith) throw s.failWith;
      s.changed.delete("catalogue");
      calls.push({ key, method: "catalogueSnapshot" });
      return { cursor: String(s.seq), products: [...s.products.values()] };
    },
    async catalogueChanges(key, cursor) {
      const s = site(key);
      allowed(s, "catalogue");
      if (s.failWith) throw s.failWith;
      calls.push({ key, method: "catalogueChanges" });
      if (Number(cursor) < s.expiredBefore) return "cursor_expired";
      s.changed.delete("catalogue");
      const entries = s.log.filter((e) => e.seq > Number(cursor));
      const latest = new Map(entries.map((e) => [e.id, e]));
      return {
        cursor: String(s.seq),
        products: [...latest.values()].filter((e) => !e.removed).map((e) => s.products.get(e.id)!),
        removed: [...latest.values()].filter((e) => e.removed).map((e) => e.id),
      };
    },
    async deliveryGrid(key) {
      const s = site(key);
      allowed(s, "delivery");
      s.changed.delete("delivery");
      calls.push({ key, method: "deliveryGrid" });
      return { cursor: String(s.grid.version), grid: s.grid };
    },
    async sendOrder(key, order) {
      const s = site(key);
      allowed(s, "orders");
      calls.push({ key, method: "sendOrder" });
      const scripted = s.answers.shift();
      if (scripted) return scripted;
      const known = s.orders.get(order.sendId);
      if (known) return { kind: "duplicate", remoteId: known.remoteId };
      const remoteId = `AV-${++remoteSeq}`;
      s.orders.set(order.sendId, { remoteId, payload: order.payload });
      return { kind: "accepted", remoteId };
    },
  };

  return {
    client,
    calls,
    site(key: string): FakeSite {
      if (!sites.has(key)) {
        sites.set(key, {
          revoked: false, denied: new Set(), products: new Map(), log: [], seq: 0, expiredBefore: 0,
          grid: { version: 1, rules: [] }, changed: new Set(), orders: new Map(), answers: [], failWith: null,
        });
      }
      return sites.get(key)!;
    },
    publish(key: string, copy: AventyProductCopy) {
      const s = this.site(key);
      s.products.set(copy.id, copy);
      s.log.push({ seq: ++s.seq, id: copy.id, removed: false });
      s.changed.add("catalogue");
    },
    withdraw(key: string, id: string) {
      const s = this.site(key);
      s.products.delete(id);
      s.log.push({ seq: ++s.seq, id, removed: true });
      s.changed.add("catalogue");
    },
    setGrid(key: string, grid: AventyDeliveryGrid) {
      const s = this.site(key);
      s.grid = grid;
      s.changed.add("delivery");
    },
    expireCursors(key: string) {
      const s = this.site(key);
      s.expiredBefore = s.seq + 1;
      s.changed.add("catalogue");
    },
  };
}
