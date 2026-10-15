import { describe, expect, it } from "vitest";
import { aventyManagedArea } from "./aventy-areas";

describe("areas Aventy manages for its merchants", () => {
  it("covers customers, delivery and the team, and nothing else", () => {
    expect(aventyManagedArea("/customers")).toBe("customers");
    expect(aventyManagedArea("/customers/c1")).toBe("customers");
    expect(aventyManagedArea("/customer-tags/new")).toBe("customers");
    expect(aventyManagedArea("/delivery/shipping-profiles")).toBe("delivery");
    expect(aventyManagedArea("/team/u1")).toBe("team");
    expect(aventyManagedArea("/teams")).toBeNull();
    expect(aventyManagedArea("/orders")).toBeNull();
    expect(aventyManagedArea("/products/store")).toBeNull();
  });
});
