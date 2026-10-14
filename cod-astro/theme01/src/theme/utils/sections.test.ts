import { describe, expect, it } from "vitest";
import { ar } from "@/theme/content/ar";
import type { StorefrontSection } from "@/core/api/types";
import { contentWithSections, pageSections, sectionSetting, STORE_HOME_SECTIONS } from "./sections";

const sections: StorefrontSection[] = [
  { id: "promo", type: "promo", settings: { promoTitle: "Soldes", promoCtaHref: "/category/sale" } },
  { id: "hero", type: "hero", settings: { heroImage: "https://cdn.test/h.webp" } },
];

describe("page sections", () => {
  it("are the published document's, in its order; an older server's config renders every section", () => {
    expect(pageSections({ design: { version: 3, preview: false, sections } }, STORE_HOME_SECTIONS).map((s) => s.type)).toEqual(["promo", "hero"]);
    expect(pageSections({}, STORE_HOME_SECTIONS).map((s) => s.type)).toEqual([...STORE_HOME_SECTIONS]);
  });

  it("override the theme's texts with the merchant's, and keep links and images apart", () => {
    const content = contentWithSections(ar, sections);
    expect(content.promoTitle).toBe("Soldes");
    expect(content.heroTitle).toBe(ar.heroTitle);
    expect((content as unknown as Record<string, unknown>).promoCtaHref).toBeUndefined();
    expect(sectionSetting(sections, "hero", "heroImage")).toBe("https://cdn.test/h.webp");
  });
});
