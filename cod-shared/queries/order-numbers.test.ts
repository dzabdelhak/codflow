import { describe, expect, it } from "vitest";
import { orderPrefixFor } from "./order-numbers";

describe("orderPrefixFor", () => {
  it("takes the subdomain's letters and digits, upper case, at most 8", () => {
    expect(orderPrefixFor("boutique-amel")).toBe("BOUTIQUE");
    expect(orderPrefixFor("nour")).toBe("NOUR");
    expect(orderPrefixFor("---")).toBe("CMD");
  });

  it("never reuses a prefix the merchant's other channels hold", () => {
    expect(orderPrefixFor("boutique-nour", ["BOUTIQUE"])).toBe("BOUTIQU2");
    expect(orderPrefixFor("boutique-zina", ["BOUTIQUE", "BOUTIQU2"])).toBe("BOUTIQU3");
    expect(orderPrefixFor("nour", ["BOUTIQUE"])).toBe("NOUR");
  });
});
