import { describe, it, expect } from "vitest";
import { pickActiveStore, suggestSubdomain, baseDomainOf } from "./store-choice";

const stores = [
  { id: "a", name: "A", status: "active", logoUrl: null, hostname: "a.codflow.dz" },
  { id: "b", name: "B", status: "active", logoUrl: null, hostname: null },
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
