import { describe, expect, it } from "vitest";
import { domainProblem, isRootDomain } from "./model";

describe("domain problems", () => {
  it("explain why a failed domain is not connected", () => {
    expect(domainProblem({ status: "failed", lastError: "no_dns_records" })).toEqual({ key: "no_dns_records" });
    expect(domainProblem({ status: "failed", lastError: "points_elsewhere:1.2.3.4,old.host.com" })).toEqual({
      key: "points_elsewhere",
      values: "1.2.3.4,old.host.com",
    });
    expect(domainProblem({ status: "pending", lastError: null })).toBeNull();
    expect(domainProblem({ status: "verified", lastError: null })).toBeNull();
  });
});

describe("root domains", () => {
  it("need A records, subdomains a CNAME", () => {
    expect(isRootDomain("boutique.dz")).toBe(true);
    expect(isRootDomain("boutique.com.dz")).toBe(true);
    expect(isRootDomain("shop.boutique.dz")).toBe(false);
    expect(isRootDomain("www.boutique.com.dz")).toBe(false);
  });
});
