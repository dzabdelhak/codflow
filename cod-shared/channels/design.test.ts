import { describe, expect, it } from "vitest";
import { brandFromStore, defaultDesign, storefrontBrand, storefrontSections, validateDesign } from "./design";
import { LANDING01_MANIFEST, THEME01_MANIFEST } from "./manifests";

const brand = { logoUrl: null, primaryColor: "#7c3aed", accentColor: "#f59e0b", bgColor: "#f8f8f8", fontId: "cairo" };
const doc = (sections: unknown[], overrides: Record<string, unknown> = {}) => ({ brand: { ...brand, ...overrides }, sections });
const full = () => defaultDesign(THEME01_MANIFEST, brand).sections;

describe("the section-state document", () => {
  it("defaults to every section of the template, in its order, all shown", () => {
    const sections = defaultDesign(THEME01_MANIFEST, brand).sections;
    expect(sections.map((s) => s.type)).toEqual(THEME01_MANIFEST.sections.map((s) => s.type));
    expect(sections.every((s) => s.enabled)).toBe(true);
    expect(validateDesign(defaultDesign(LANDING01_MANIFEST, brand), LANDING01_MANIFEST).ok).toBe(true);
  });

  it("keeps the merchant's order, visibility and texts, trimmed, dropping empty ones", () => {
    const [hero, ...rest] = full();
    const result = validateDesign(
      doc([
        ...rest,
        { ...hero, enabled: false, settings: { heroTitle: { ar: "  مرحبا ", fr: " " }, heroCtaHref: "/products", heroImage: "https://cdn.test/a.webp" } },
      ]),
      THEME01_MANIFEST,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const last = result.document.sections.at(-1)!;
    expect(last).toMatchObject({ type: "hero", enabled: false });
    expect(last.settings).toEqual({ heroTitle: { ar: "مرحبا" }, heroCtaHref: "/products", heroImage: "https://cdn.test/a.webp" });
  });

  it("offers only what the manifest declares", () => {
    const sections = full();
    const unknownSection = validateDesign(doc([...sections, { id: "x", type: "carousel", enabled: true, settings: {} }]), THEME01_MANIFEST);
    const unknownSetting = validateDesign(
      doc(sections.map((s) => (s.type === "hero" ? { ...s, settings: { heroVideo: "https://x.test/v.mp4" } } : s))),
      THEME01_MANIFEST,
    );
    const unknownFont = validateDesign(doc(sections, { fontId: "comic-sans" }), THEME01_MANIFEST);
    expect([unknownSection.ok, unknownSetting.ok, unknownFont.ok]).toEqual([false, false, false]);
  });

  it("refuses to hide or drop an essential section", () => {
    const hidden = validateDesign(doc(full().map((s) => (s.type === "best_sellers" ? { ...s, enabled: false } : s))), THEME01_MANIFEST);
    const dropped = validateDesign(doc(full().filter((s) => s.type !== "best_sellers")), THEME01_MANIFEST);
    expect(hidden).toMatchObject({ ok: false, errors: [{ path: "sections[2].enabled" }] });
    expect(dropped.ok).toBe(false);
  });

  it("adds a section the document forgot, hidden", () => {
    const result = validateDesign(doc(full().filter((s) => s.type !== "promo")), THEME01_MANIFEST);
    expect(result.ok && result.document.sections.at(-1)).toMatchObject({ type: "promo", enabled: false });
  });

  it("refuses unsafe links, bad colours and duplicates", () => {
    const sections = full();
    const script = validateDesign(
      doc(sections.map((s) => (s.type === "hero" ? { ...s, settings: { heroCtaHref: "javascript:alert(1)" } } : s))),
      THEME01_MANIFEST,
    );
    const colour = validateDesign(doc(sections, { primaryColor: "red; background:url(x)" }), THEME01_MANIFEST);
    const twice = validateDesign(doc([...sections, { ...sections[0], id: "hero-2" }]), THEME01_MANIFEST);
    expect([script.ok, colour.ok, twice.ok]).toEqual([false, false, false]);
  });
});

describe("what the storefront receives", () => {
  it("lists the shown sections in order, with texts in the store's language only", () => {
    const sections = full().map((s) =>
      s.type === "hero" ? { ...s, settings: { heroTitle: { ar: "مرحبا", fr: "Bonjour" }, heroCtaHref: "/products" } } : s,
    );
    sections[1].enabled = false;
    const shown = storefrontSections(sections, "fr");
    expect(shown.map((s) => s.type)).not.toContain("categories");
    expect(shown[0]).toEqual({ id: "hero", type: "hero", settings: { heroTitle: "Bonjour", heroCtaHref: "/products" } });
    expect(storefrontSections(sections, "en")[0].settings).toEqual({ heroCtaHref: "/products" });
  });

  it("turns the chosen font into its family and stylesheet", () => {
    expect(storefrontBrand({ ...brand, fontId: "tajawal" }, THEME01_MANIFEST)).toMatchObject({
      fontFamily: "Tajawal, sans-serif",
      fontUrl: expect.stringContaining("family=Tajawal"),
    });
  });

  it("keeps a font the template does not offer, instead of replacing it", () => {
    const custom = brandFromStore(
      { logoUrl: null, primaryColor: "#112233", accentColor: "#abc", bgColor: "#fff", fontFamily: "Montserrat, sans-serif" },
      THEME01_MANIFEST,
    );
    expect(custom.fontId).toBe("current");
    expect(validateDesign(doc(full(), { fontId: "current" }), THEME01_MANIFEST).ok).toBe(true);
    expect(storefrontBrand(custom, THEME01_MANIFEST)).not.toHaveProperty("fontFamily");
  });

  it("starts from the store's current brand", () => {
    expect(
      brandFromStore({ logoUrl: null, primaryColor: "#112233", accentColor: "#abc", bgColor: "nope", fontFamily: "Almarai, sans-serif" }, THEME01_MANIFEST),
    ).toEqual({ logoUrl: null, primaryColor: "#112233", accentColor: "#abc", bgColor: "#f8f8f8", fontId: "almarai" });
  });
});
