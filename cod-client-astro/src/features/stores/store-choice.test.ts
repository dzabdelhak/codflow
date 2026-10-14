import { describe, it, expect } from "vitest";
import { pickActiveStore, suggestSubdomain, baseDomainOf, filterStores, canDeleteStore, type MerchantStore } from "./store-choice";

const store = (overrides: Partial<MerchantStore>): MerchantStore => ({
  id: "x",
  name: "X",
  type: "store",
  status: "published",
  logoUrl: null,
  hostname: null,
  hasOrders: false,
  createdAt: "2026-10-13T00:00:00.000Z",
  ...overrides,
});

const stores = [
  store({ id: "a", name: "A", hostname: "a.codflow.dz" }),
  store({ id: "b", name: "B" }),
];

describe("pickActiveStore", () => {
  it("keeps the saved store when it is still one of the merchant's", () => {
    expect(pickActiveStore(stores, "b")?.id).toBe("b");
  });

  it("falls back to the first store when the saved one is gone", () => {
    expect(pickActiveStore(stores, "deleted")?.id).toBe("a");
    expect(pickActiveStore(stores, null)?.id).toBe("a");
  });

  it("has no active store when the merchant has none", () => {
    expect(pickActiveStore([], "a")).toBeNull();
  });
});

describe("suggestSubdomain", () => {
  it("turns a store name into a valid subdomain", () => {
    expect(suggestSubdomain("Boutique Nour")).toBe("boutique-nour");
    expect(suggestSubdomain("  Élégance & Co.  ")).toBe("elegance-co");
    expect(suggestSubdomain("--Shop__2026--")).toBe("shop-2026");
  });

  it("gives nothing usable for a name without Latin letters or digits", () => {
    expect(suggestSubdomain("متجر نور")).toBe("");
  });

  it("stays within 40 characters and never ends on a hyphen", () => {
    const suggestion = suggestSubdomain("a very long store name that keeps going and going on");
    expect(suggestion.length).toBeLessThanOrEqual(40);
    expect(suggestion.endsWith("-")).toBe(false);
  });
});

describe("baseDomainOf", () => {
  it("is the hostname of an existing store without its first label", () => {
    expect(baseDomainOf(stores)).toBe("codflow.dz");
  });

  it("is unknown when no store has a hostname yet", () => {
    expect(baseDomainOf([stores[1]])).toBeNull();
  });
});

describe("filterStores", () => {
  const list = [
    store({ id: "1", name: "Boutique Nour", status: "published", hostname: "nour.codflow.dz" }),
    store({ id: "2", name: "Amel Shop", status: "suspended" }),
    store({ id: "3", name: "Old", status: "archived" }),
  ];

  it("searches by name, ignoring case, and by address", () => {
    expect(filterStores(list, "nour", "all").map((s) => s.id)).toEqual(["1"]);
    expect(filterStores(list, "AMEL", "all").map((s) => s.id)).toEqual(["2"]);
    expect(filterStores(list, "codflow.dz", "all").map((s) => s.id)).toEqual(["1"]);
  });

  it("filters by status", () => {
    expect(filterStores(list, "", "archived").map((s) => s.id)).toEqual(["3"]);
    expect(filterStores(list, "", "all")).toHaveLength(3);
  });
});

describe("canDeleteStore", () => {
  it("allows deleting only an archived store without orders that is not the merchant's last", () => {
    const archived = store({ id: "a", status: "archived" });
    expect(canDeleteStore(archived, [archived, store({ id: "b" })])).toBe(true);
    expect(canDeleteStore({ ...archived, hasOrders: true }, [archived, store({ id: "b" })])).toBe(false);
    expect(canDeleteStore({ ...archived, status: "suspended" }, [archived, store({ id: "b" })])).toBe(false);
    expect(canDeleteStore(archived, [archived])).toBe(false);
  });
});
