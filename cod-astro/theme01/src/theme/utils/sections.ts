import type { StoreConfig, StorefrontSection } from "@/core/api/types";
import type { StoreFrontContent } from "@/theme/content";

export const STORE_HOME_SECTIONS = [
  "hero",
  "categories",
  "best_sellers",
  "how_it_works",
  "new_arrivals",
  "features",
  "promo",
  "testimonials",
] as const;

export const LANDING_SECTIONS = ["banner", "product", "gallery", "benefits", "price", "order_form", "faq", "reassurance"] as const;

export function pageSections(config: Pick<StoreConfig, "design">, defaults: readonly string[]): StorefrontSection[] {
  return config.design?.sections ?? defaults.map((type) => ({ id: type, type, settings: {} }));
}

export function contentWithSections(content: StoreFrontContent, sections: StorefrontSection[]): StoreFrontContent {
  const merged: Record<string, unknown> = { ...content };
  for (const section of sections) {
    for (const [key, value] of Object.entries(section.settings)) {
      if (key in content) merged[key] = value;
    }
  }
  return merged as unknown as StoreFrontContent;
}

export function sectionSetting(sections: StorefrontSection[], type: string, key: string): string | undefined {
  return sections.find((section) => section.type === type)?.settings[key];
}
