/// <reference types="vitest/globals" />
import { afterEach, beforeEach, vi } from "vitest";
import { consentDecision, setConsent, track } from "./track";
import { pageTrackers, trackersHeadScript } from "./config";

const all = {
  meta: "1111111111111111",
  tiktok: "TIKTOKPIXEL000000001",
  snap: "6b9d1f3a-1111-4c2d-9e8f-1234567890ab",
  ga4: "G-ABC123DEF4",
  googleAds: { id: "AW-123456789", label: "abcDEF123" },
  consentRequired: false,
};

let fbq: ReturnType<typeof vi.fn>;
let ttq: { track: ReturnType<typeof vi.fn> };
let snaptr: ReturnType<typeof vi.fn>;
let gtag: ReturnType<typeof vi.fn>;

function install(trackers: Record<string, unknown> = all) {
  const w = window as unknown as Record<string, unknown>;
  w.__codTrackers = trackers;
  w.fbq = fbq = vi.fn();
  w.ttq = ttq = { track: vi.fn() };
  w.snaptr = snaptr = vi.fn();
  w.gtag = gtag = vi.fn();
}

beforeEach(() => {
  document.cookie = "cod_consent=; Max-Age=0; Path=/";
});

afterEach(() => {
  for (const key of ["__codTrackers", "fbq", "ttq", "snaptr", "gtag"]) Reflect.deleteProperty(window, key);
});

describe("a funnel event", () => {
  it("reaches every tracker of the page under the provider's own name", () => {
    install();
    track("AddToCart", { items: [{ id: "p1", quantity: 2, price: 1000 }], value: 2000 });

    expect(fbq).toHaveBeenCalledWith("trackSingle", all.meta, "AddToCart", expect.objectContaining({ content_ids: ["p1"], value: 2000, currency: "DZD" }));
    expect(ttq.track).toHaveBeenCalledWith("AddToCart", expect.objectContaining({ contents: [{ content_id: "p1", quantity: 2, price: 1000 }], value: 2000 }));
    expect(snaptr).toHaveBeenCalledWith("track", "ADD_CART", expect.objectContaining({ item_ids: ["p1"], price: 2000, currency: "DZD" }));
    expect(gtag).toHaveBeenCalledWith("event", "add_to_cart", expect.objectContaining({ send_to: all.ga4, value: 2000 }));
    expect(gtag).not.toHaveBeenCalledWith("event", "conversion", expect.anything());
  });

  it("does nothing on a page without trackers", () => {
    expect(() => track("ViewContent", { value: 1 })).not.toThrow();
  });
});

describe("the sale", () => {
  it("carries the order id as the deduplication id, with the event the server chose for each tracker", () => {
    install();
    track("Purchase", { value: 2900 }, { eventId: "order-1", events: { meta: "Lead", tiktok: "Purchase", snap: null, ga4: "Purchase", googleAds: "Purchase" } });

    expect(fbq).toHaveBeenCalledWith("trackSingle", all.meta, "Lead", expect.anything(), { eventID: "order-1" });
    expect(ttq.track).toHaveBeenCalledWith("CompletePayment", expect.objectContaining({ value: 2900 }), { event_id: "order-1" });
    expect(snaptr).not.toHaveBeenCalled();
    expect(gtag).toHaveBeenCalledWith("event", "purchase", expect.objectContaining({ transaction_id: "order-1" }));
    expect(gtag).toHaveBeenCalledWith("event", "conversion", { send_to: "AW-123456789/abcDEF123", value: 2900, currency: "DZD", transaction_id: "order-1" });
  });
});

describe("a channel that asks for consent", () => {
  it("holds events until the shopper accepts, then sends them", () => {
    install({ ...all, consentRequired: true });
    track("ViewContent", { value: 1 });
    expect(fbq).not.toHaveBeenCalled();

    setConsent(true);
    expect(consentDecision()).toBe("granted");
    expect(fbq).toHaveBeenCalledWith("trackSingle", all.meta, "ViewContent", expect.anything());
  });

  it("sends nothing after a refusal", () => {
    install({ ...all, consentRequired: true });
    setConsent(false);
    track("ViewContent", { value: 1 });
    expect(consentDecision()).toBe("denied");
    expect(fbq).not.toHaveBeenCalled();
  });
});

describe("the head loader", () => {
  it("loads nothing for a page without trackers", () => {
    expect(trackersHeadScript(pageTrackers(null, null))).toBe("");
  });

  it("names each configured tracker, and waits for consent when asked", () => {
    const script = trackersHeadScript(pageTrackers(all.meta, { ...all, consentRequired: true }));
    for (const id of [all.meta, all.tiktok, all.snap, all.ga4, all.googleAds.id]) expect(script).toContain(id);
    expect(script).toContain("cod:consent");
    expect(script).toContain("if(!c.consentRequired){load();return;}");
  });

  it("cannot be broken out of by an identifier", () => {
    const script = trackersHeadScript(pageTrackers("</script><script>alert(1)</script>", null));
    expect(script).not.toContain("</script>");
  });
});
