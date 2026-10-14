import type { TrackingProvider } from "./identifiers";

export type FunnelEvent = "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase" | "Lead";

export const PROVIDER_EVENT_NAMES: Record<TrackingProvider, Record<FunnelEvent, string | null>> = {
  meta: {
    PageView: "PageView",
    ViewContent: "ViewContent",
    AddToCart: "AddToCart",
    InitiateCheckout: "InitiateCheckout",
    Purchase: "Purchase",
    Lead: "Lead",
  },
  tiktok: {
    PageView: null,
    ViewContent: "ViewContent",
    AddToCart: "AddToCart",
    InitiateCheckout: "InitiateCheckout",
    Purchase: "CompletePayment",
    Lead: "SubmitForm",
  },
  snap: {
    PageView: "PAGE_VIEW",
    ViewContent: "VIEW_CONTENT",
    AddToCart: "ADD_CART",
    InitiateCheckout: "START_CHECKOUT",
    Purchase: "PURCHASE",
    Lead: "SIGN_UP",
  },
  ga4: {
    PageView: null,
    ViewContent: "view_item",
    AddToCart: "add_to_cart",
    InitiateCheckout: "begin_checkout",
    Purchase: "purchase",
    Lead: "generate_lead",
  },
  googleAds: {
    PageView: null,
    ViewContent: null,
    AddToCart: null,
    InitiateCheckout: null,
    Purchase: "conversion",
    Lead: "conversion",
  },
};

export function providerEventName(provider: TrackingProvider, event: FunnelEvent): string | null {
  return PROVIDER_EVENT_NAMES[provider][event];
}
