import { describe, expect, it } from "vitest";
import { domainTargets, normaliseDomain } from "./channel-domains";

describe("normaliseDomain", () => {
  it("keeps the hostname of whatever the merchant pastes, lower-cased, in ASCII", () => {
    expect(normaliseDomain("  https://Shop.Example.com/products?x=1 ", "codflow.app")).toBe("shop.example.com");
    expect(normaliseDomain("www.boutique.dz.", "codflow.app")).toBe("www.boutique.dz");
    expect(normaliseDomain("shop.example.com:443", "codflow.app")).toBe("shop.example.com");
    expect(normaliseDomain("مثال.الجزائر", "codflow.app")).toBe("xn--mgbh0fb.xn--lgbbat1ad8j");
  });

  it("refuses a non-domain and anything under the platform's own domain", () => {
    for (const raw of ["", "localhost", "no spaces.com", "192.168.1.1", "-bad.com", "codflow.app", "shop.codflow.app"]) {
      expect(normaliseDomain(raw, "codflow.app"), raw).toBeNull();
    }
  });
});

describe("domainTargets", () => {
  it("reads the CNAME target and the IPv4 list from the environment", () => {
    expect(domainTargets({ CUSTOM_DOMAIN_TARGET: "Stores.Codflow.App.", CUSTOM_DOMAIN_IPV4: "203.0.113.10, 203.0.113.11" })).toEqual({
      cname: "stores.codflow.app",
      ipv4: ["203.0.113.10", "203.0.113.11"],
    });
    expect(domainTargets({})).toEqual({ cname: null, ipv4: [] });
  });
});
