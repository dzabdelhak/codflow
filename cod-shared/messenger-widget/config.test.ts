import { describe, expect, it } from "vitest";
import {
  DEFAULT_MESSENGER_WIDGET,
  normalisePage,
  parseMessengerWidgetConfig,
  resolveStorefrontMessenger,
  serializeMessengerWidgetConfig,
  validateMessengerWidgetInput,
} from "./config";

describe("the Messenger button", () => {
  it("accepts a page username, an id, or a pasted page link", () => {
    expect(normalisePage("https://www.facebook.com/MaisonLina/")).toBe("MaisonLina");
    expect(normalisePage("m.me/maison.lina?ref=x")).toBe("maison.lina");
    expect(normalisePage("https://www.facebook.com/profile.php?id=100089123456789")).toBe("100089123456789");
    expect(normalisePage("@MaisonLina")).toBe("MaisonLina");
  });

  it("validates what the dashboard saves", () => {
    expect(validateMessengerWidgetInput({ enabled: true, page: "facebook.com/MaisonLina", position: "left", label: " Écrivez-nous " })).toEqual({
      ok: true,
      config: { enabled: true, page: "MaisonLina", position: "left", label: "Écrivez-nous" },
    });
    const missing = validateMessengerWidgetInput({ enabled: true, page: "" });
    expect(missing.ok ? [] : missing.issues.map((i) => i.path)).toEqual(["page"]);
    const wrong = validateMessengerWidgetInput({ enabled: false, page: "bad page!", position: "top", extra: 1 });
    expect(wrong.ok ? [] : wrong.issues.map((i) => i.path).sort()).toEqual(["extra", "page", "position"]);
  });

  it("shows on the storefront only when on and pointing at a page", () => {
    const on = serializeMessengerWidgetConfig({ enabled: true, page: "MaisonLina", position: "right", label: "" });
    expect(resolveStorefrontMessenger(on)).toEqual({ url: "https://m.me/MaisonLina", position: "right", label: null });
    expect(resolveStorefrontMessenger(serializeMessengerWidgetConfig({ ...DEFAULT_MESSENGER_WIDGET, page: "MaisonLina" }))).toBeNull();
    expect(resolveStorefrontMessenger(null)).toBeNull();
    expect(resolveStorefrontMessenger("not json")).toBeNull();
  });

  it("reads anything stored without throwing", () => {
    expect(parseMessengerWidgetConfig('{"enabled":"yes","position":"up"}')).toEqual(DEFAULT_MESSENGER_WIDGET);
  });
});
