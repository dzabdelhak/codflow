import type { ChannelType } from "./types";
import type { TemplateManifest } from "./manifests";
import { defaultDesign, type DesignBrand, type DesignDocument, type LocalizedText, type SettingValue } from "./design";

export interface TemplatePreset {
  brand: Pick<DesignBrand, "primaryColor" | "accentColor" | "bgColor" | "fontId">;
  sections: Array<{ type: string; enabled?: boolean; settings?: Record<string, SettingValue> }>;
}

export interface ChannelTemplate {
  id: string;
  type: ChannelType;
  preset: TemplatePreset;
}

const text = (ar: string, fr: string, en: string): LocalizedText => ({ ar, fr, en });
const photo = (id: string) => `https://images.unsplash.com/photo-${id}?w=1600&q=80`;

export const CHANNEL_TEMPLATES: readonly ChannelTemplate[] = [
  {
    id: "theme01",
    type: "store",
    preset: {
      brand: { primaryColor: "#7c3aed", accentColor: "#f59e0b", bgColor: "#f8f8f8", fontId: "cairo" },
      sections: ["hero", "categories", "best_sellers", "how_it_works", "new_arrivals", "features", "promo", "testimonials"].map((type) => ({ type })),
    },
  },
  {
    id: "boutique",
    type: "store",
    preset: {
      brand: { primaryColor: "#1f2937", accentColor: "#c9a227", bgColor: "#faf7f2", fontId: "tajawal" },
      sections: [
        {
          type: "hero",
          settings: {
            heroEyebrow: text("تشكيلة الموسم", "Collection de saison", "Season collection"),
            heroTitle: text("الأناقة في كل يوم", "L'élégance au quotidien", "Everyday elegance"),
            heroSubtitle: text(
              "قطع مختارة بعناية، توصيل إلى كل الولايات والدفع عند الاستلام",
              "Des pièces choisies avec soin, livrées dans toutes les wilayas, payées à la livraison",
              "Carefully chosen pieces, delivered to every wilaya, paid on delivery",
            ),
            heroImage: photo("1483985988355-763728e1935b"),
            heroCtaPrimary: text("اكتشف التشكيلة", "Découvrir la collection", "Discover the collection"),
          },
        },
        { type: "new_arrivals", settings: { newArrivalsSection: text("وصل حديثًا", "Nouveautés", "Just in") } },
        { type: "categories" },
        { type: "best_sellers", settings: { bestSellersSection: text("الأكثر طلبًا", "Les plus demandés", "Most wanted") } },
        {
          type: "promo",
          settings: {
            promoTitle: text("قطع جديدة كل أسبوع", "De nouvelles pièces chaque semaine", "New pieces every week"),
            promoSub: text("تابع جديدنا واطلب قبل نفاد الكمية", "Suivez nos arrivages et commandez avant la rupture", "Follow our arrivals and order before they sell out"),
          },
        },
        { type: "testimonials" },
        { type: "how_it_works", enabled: false },
        { type: "features", enabled: false },
      ],
    },
  },
  {
    id: "electro",
    type: "store",
    preset: {
      brand: { primaryColor: "#0f62fe", accentColor: "#06b6d4", bgColor: "#f4f7fb", fontId: "ibm-plex" },
      sections: [
        {
          type: "hero",
          settings: {
            heroEyebrow: text("تكنولوجيا", "High-tech", "High-tech"),
            heroTitle: text("التكنولوجيا تصلك إلى باب منزلك", "La technologie livrée chez vous", "Technology delivered to your door"),
            heroSubtitle: text(
              "سماعات، ساعات ذكية وإكسسوارات — ادفع عند الاستلام",
              "Casques, montres connectées et accessoires — payez à la livraison",
              "Headphones, smartwatches and accessories — pay on delivery",
            ),
            heroImage: photo("1505740420928-5e560c06d30e"),
            heroCtaPrimary: text("تسوق الآن", "Voir les produits", "Shop now"),
          },
        },
        {
          type: "features",
          settings: {
            feature1Title: text("منتجات مجربة", "Produits testés", "Tested products"),
            feature2Title: text("توصيل 58 ولاية", "Livraison 58 wilayas", "Delivery to 58 wilayas"),
            feature3Title: text("الدفع عند الاستلام", "Paiement à la livraison", "Cash on delivery"),
            feature5Title: text("خدمة العملاء", "Service client", "Customer service"),
          },
        },
        { type: "best_sellers", settings: { bestSellersSection: text("الأكثر مبيعًا", "Meilleures ventes", "Best sellers") } },
        { type: "categories" },
        { type: "new_arrivals" },
        { type: "how_it_works" },
        { type: "testimonials" },
        { type: "promo", enabled: false },
      ],
    },
  },
  {
    id: "landing01",
    type: "landing",
    preset: {
      brand: { primaryColor: "#7c3aed", accentColor: "#f59e0b", bgColor: "#f8f8f8", fontId: "cairo" },
      sections: ["banner", "product", "gallery", "benefits", "price", "order_form", "faq", "reassurance"].map((type) => ({ type })),
    },
  },
  {
    id: "flash",
    type: "landing",
    preset: {
      brand: { primaryColor: "#dc2626", accentColor: "#facc15", bgColor: "#fff7ed", fontId: "almarai" },
      sections: [
        { type: "banner", settings: { landingEyebrow: text("عرض محدود", "Offre limitée", "Limited offer") } },
        { type: "price", settings: { landingPriceTitle: text("السعر الخاص اليوم", "Prix spécial aujourd'hui", "Today's special price") } },
        { type: "order_form", settings: { orderCta: text("اطلب الآن", "Je commande maintenant", "Order now") } },
        {
          type: "benefits",
          settings: {
            landingBenefitsTitle: text("لماذا تختاره", "Pourquoi le choisir", "Why choose it"),
            landingBenefit1: text("الدفع عند الاستلام", "Paiement à la livraison", "Cash on delivery"),
            landingBenefit2: text("توصيل إلى 58 ولاية", "Livraison dans les 58 wilayas", "Delivery to all 58 wilayas"),
            landingBenefit3: text("تأكيد الطلب بالهاتف", "Confirmation par téléphone", "Confirmed by phone"),
            landingBenefit4: text("جودة مضمونة", "Qualité vérifiée", "Checked quality"),
          },
        },
        { type: "gallery" },
        { type: "product" },
        { type: "reassurance" },
        { type: "faq" },
      ],
    },
  },
];

export function templateById(templateId: string): ChannelTemplate | undefined {
  return CHANNEL_TEMPLATES.find((t) => t.id === templateId);
}

export function isTemplateFor(type: ChannelType, templateId: string): boolean {
  return templateById(templateId)?.type === type;
}

export function defaultTemplateFor(type: ChannelType): string {
  return CHANNEL_TEMPLATES.find((t) => t.type === type)!.id;
}

export function templateDesign(templateId: string, manifest: TemplateManifest, brand: DesignBrand): DesignDocument {
  const preset = templateById(templateId)?.preset;
  if (!preset) return defaultDesign(manifest, brand);
  const listed = preset.sections.filter((section) => manifest.sections.some((spec) => spec.type === section.type));
  const missing = manifest.sections.filter((spec) => !listed.some((section) => section.type === spec.type));
  return {
    brand,
    sections: [
      ...listed.map((section) => ({ id: section.type, type: section.type, enabled: section.enabled ?? true, settings: section.settings ?? {} })),
      ...missing.map((spec) => ({ id: spec.type, type: spec.type, enabled: true, settings: {} })),
    ],
  };
}

export function presetBrand(templateId: string, manifest: TemplateManifest): { primaryColor: string; accentColor: string; bgColor: string; fontFamily: string | null; fontUrl: string | null } | null {
  const preset = templateById(templateId)?.preset;
  if (!preset) return null;
  const font = manifest.brand.fonts.find((f) => f.id === preset.brand.fontId);
  return {
    primaryColor: preset.brand.primaryColor,
    accentColor: preset.brand.accentColor,
    bgColor: preset.brand.bgColor,
    fontFamily: font?.family ?? null,
    fontUrl: font?.url ?? null,
  };
}
