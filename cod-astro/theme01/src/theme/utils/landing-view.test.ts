import { describe, expect, it } from "vitest";
import { filledTexts, isLandingChannel, landingOrderSection } from "./landing-view";

describe("landing view", () => {
  it("treats only a landing channel as a landing; an older server's config is a store", () => {
    expect(isLandingChannel({ channelType: "landing" })).toBe(true);
    expect(isLandingChannel({ channelType: "store" })).toBe(false);
    expect(isLandingChannel({})).toBe(false);
  });

  it("shows the order form while the main product is available, whatever the rule", () => {
    expect(landingOrderSection({ available: true, unavailableRule: "hide_order_form" })).toBe("form");
    expect(landingOrderSection({ available: true, unavailableRule: "show_unavailable" })).toBe("form");
  });

  it("applies the rule while the main product is unavailable", () => {
    expect(landingOrderSection({ available: false, unavailableRule: "hide_order_form" })).toBe("none");
    expect(landingOrderSection({ available: false, unavailableRule: "show_unavailable" })).toBe("unavailable");
    expect(landingOrderSection({ available: false, unavailableRule: "suspend" })).toBe("unavailable");
  });

  it("keeps only the texts the merchant filled in", () => {
    expect(filledTexts("Soft", " ", "", undefined, "Light")).toEqual(["Soft", "Light"]);
  });
});
