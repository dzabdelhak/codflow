import { describe, expect, it } from "vitest";
import { thankYouUrl } from "./thank-you-url";

describe("thankYouUrl", () => {
  it("carries the order number, total and id", () => {
    const url = new URL(thankYouUrl({ orderNumber: "NOUR-00012", orderId: "o 1", total: 2900 }), "https://shop.test");
    expect(url.pathname).toBe("/thank-you");
    expect(Object.fromEntries(url.searchParams)).toEqual({ order: "NOUR-00012", total: "2900", oid: "o 1" });
  });

  it("flags a delivery fee still to be confirmed", () => {
    const url = new URL(thankYouUrl({ orderNumber: "CMD-00001", total: 2500, feeToConfirm: true }), "https://shop.test");
    expect(url.searchParams.get("fee")).toBe("confirm");
  });
});
