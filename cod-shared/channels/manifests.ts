export const DESIGN_LOCALES = ["ar", "fr", "en"] as const;

export type DesignLocale = (typeof DESIGN_LOCALES)[number];

export type SettingKind = "text" | "textarea" | "image" | "url";

export interface SettingSpec {
  key: string;
  kind: SettingKind;
}

export interface SectionSpec {
  type: string;
  essential?: boolean;
  settings: SettingSpec[];
}

export interface FontOption {
  id: string;
  label: string;
  family: string;
  url: string;
}

export interface TemplateManifest {
  templateId: string;
  brand: { fonts: FontOption[] };
  sections: SectionSpec[];
}

const googleFont = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;600;700;800;900&display=swap`;

export const FONTS: FontOption[] = [
  { id: "cairo", label: "Cairo", family: "Cairo, sans-serif", url: googleFont("Cairo") },
  { id: "tajawal", label: "Tajawal", family: "Tajawal, sans-serif", url: "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" },
  { id: "almarai", label: "Almarai", family: "Almarai, sans-serif", url: "https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&display=swap" },
  { id: "noto-kufi", label: "Noto Kufi Arabic", family: "'Noto Kufi Arabic', sans-serif", url: googleFont("Noto Kufi Arabic") },
  { id: "ibm-plex", label: "IBM Plex Sans Arabic", family: "'IBM Plex Sans Arabic', sans-serif", url: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" },
];

const text = (key: string): SettingSpec => ({ key, kind: "text" });
const textarea = (key: string): SettingSpec => ({ key, kind: "textarea" });
const image = (key: string): SettingSpec => ({ key, kind: "image" });
const url = (key: string): SettingSpec => ({ key, kind: "url" });

export const THEME01_MANIFEST: TemplateManifest = {
  templateId: "theme01",
  brand: { fonts: FONTS },
  sections: [
    {
      type: "hero",
      settings: [
        text("heroEyebrow"),
        text("heroTitle"),
        textarea("heroSubtitle"),
        image("heroImage"),
        text("heroCtaPrimary"),
        url("heroCtaHref"),
        text("heroCtaSecondary"),
      ],
    },
    { type: "categories", settings: [] },
    { type: "best_sellers", essential: true, settings: [text("bestSellersSection"), text("bestSellersSub")] },
    {
      type: "how_it_works",
      settings: [
        text("howItWorksTitle"),
        text("howItWorksSub"),
        text("howStep1Title"),
        text("howStep1Sub"),
        text("howStep2Title"),
        text("howStep2Sub"),
        text("howStep3Title"),
        text("howStep3Sub"),
      ],
    },
    { type: "new_arrivals", settings: [text("newArrivalsSection"), text("newArrivalsSub")] },
    { type: "features", settings: [text("feature1Title"), text("feature2Title"), text("feature3Title"), text("feature5Title")] },
    { type: "promo", settings: [text("promoTitle"), textarea("promoSub"), text("promoCtaText"), url("promoCtaHref")] },
    { type: "testimonials", settings: [text("testimonialsTitle"), text("testimonialsSub")] },
  ],
};

export const LANDING01_MANIFEST: TemplateManifest = {
  templateId: "landing01",
  brand: { fonts: FONTS },
  sections: [
    { type: "banner", essential: true, settings: [text("landingEyebrow"), image("landingBannerImage")] },
    { type: "product", settings: [text("landingDescriptionTitle")] },
    { type: "gallery", settings: [text("landingGalleryTitle")] },
    {
      type: "benefits",
      settings: [
        text("landingBenefitsTitle"),
        text("landingBenefit1"),
        text("landingBenefit2"),
        text("landingBenefit3"),
        text("landingBenefit4"),
      ],
    },
    { type: "price", essential: true, settings: [text("landingPriceTitle")] },
    { type: "order_form", essential: true, settings: [text("orderCta")] },
    {
      type: "faq",
      settings: [
        text("landingFaqTitle"),
        text("landingFaq1Q"),
        textarea("landingFaq1A"),
        text("landingFaq2Q"),
        textarea("landingFaq2A"),
        text("landingFaq3Q"),
        textarea("landingFaq3A"),
      ],
    },
    {
      type: "reassurance",
      settings: [
        text("landingReassuranceTitle"),
        text("trust1Title"),
        text("trust1Sub"),
        text("trust2Title"),
        text("trust2Sub"),
        text("trust3Title"),
        text("trust3Sub"),
      ],
    },
  ],
};

export const TEMPLATE_MANIFESTS: Record<string, TemplateManifest> = {
  theme01: THEME01_MANIFEST,
  landing01: LANDING01_MANIFEST,
};

export function manifestFor(templateId: string, channelType: "store" | "landing"): TemplateManifest {
  return TEMPLATE_MANIFESTS[templateId] ?? (channelType === "landing" ? LANDING01_MANIFEST : THEME01_MANIFEST);
}
