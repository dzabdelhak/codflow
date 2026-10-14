/**
 * Cart funnel events.
 *
 * A store with no trackers configured must behave as if this file did not
 * exist: every call a silent no-op, never an exception in the middle of an
 * add-to-cart. And AddToCart means "these were added", not "this is the
 * basket": sending the whole basket on each tap would re-report everything
 * already in it.
 */
/// <reference types="vitest/globals" />

import { afterEach, vi } from "vitest";
import { trackAddToCart, trackInitiateCheckout } from "./pixel";
import type { CartLine } from "./cart";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: "p1",
    productName: "Street Fighter 45",
    variantId: null,
    variantLabel: null,
    quantity: 1,
    unitPrice: 1000,
    ...overrides,
  };
}

function installPixel(): ReturnType<typeof vi.fn> {
  const fbq = vi.fn();
  (window as unknown as { fbq: unknown }).fbq = fbq;
  (window as unknown as { __codTrackers: unknown }).__codTrackers = {
    meta: "PIX",
    tiktok: null,
    snap: null,
    ga4: null,
    googleAds: null,
    consentRequired: false,
  };
  return fbq;
}

afterEach(() => {
  Reflect.deleteProperty(window, "fbq");
  Reflect.deleteProperty(window, "__codTrackers");
});

describe("a store with no tracker configured", () => {
  it("does not throw on add to cart or checkout", () => {
    expect(() => trackAddToCart([line()])).not.toThrow();
    expect(() => trackInitiateCheckout([line()], 1000)).not.toThrow();
  });

  it("ignores an fbq that is not callable", () => {
    (window as unknown as { fbq: unknown }).fbq = { queue: [] };
    (window as unknown as { __codTrackers: unknown }).__codTrackers = { meta: "PIX", consentRequired: false };
    expect(() => trackAddToCart([line()])).not.toThrow();
  });
});

describe("AddToCart", () => {
  it("reports only what was just added, at the page's pixel", () => {
    const fbq = installPixel();

    trackAddToCart([line({ quantity: 2, unitPrice: 2400 })]);

    expect(fbq).toHaveBeenCalledTimes(1);
    const [method, pixel, event, payload] = fbq.mock.calls[0];
    expect([method, pixel, event]).toEqual(["trackSingle", "PIX", "AddToCart"]);
    expect(payload).toMatchObject({ content_ids: ["p1"], content_type: "product", num_items: 2, value: 4800, currency: "DZD" });
    expect(payload.contents).toEqual([{ id: "p1", quantity: 2, item_price: 2400 }]);
  });

  it("reports a multi-variant add as one event covering every line", () => {
    const fbq = installPixel();

    trackAddToCart([line({ variantId: "blue", quantity: 2 }), line({ variantId: "red", quantity: 1 })]);

    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq.mock.calls[0][3]).toMatchObject({ content_ids: ["p1"], num_items: 3, value: 3000 });
  });

  it("sends nothing when nothing was added", () => {
    const fbq = installPixel();
    trackAddToCart([]);
    expect(fbq).not.toHaveBeenCalled();
  });
});

describe("InitiateCheckout", () => {
  it("reports the basket with the value it is given", () => {
    const fbq = installPixel();

    trackInitiateCheckout([line({ quantity: 2, unitPrice: 2400 }), line({ productId: "p2" })], 5800);

    const [, , event, payload] = fbq.mock.calls[0];
    expect(event).toBe("InitiateCheckout");
    expect(payload).toMatchObject({ content_ids: ["p1", "p2"], num_items: 3, value: 5800, currency: "DZD" });
  });

  it("sends nothing for an empty basket", () => {
    const fbq = installPixel();
    trackInitiateCheckout([], 0);
    expect(fbq).not.toHaveBeenCalled();
  });
});
