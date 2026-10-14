import { DESIGN_LOCALES, type DesignLocale, type SettingSpec, type TemplateManifest } from "./manifests";

export type LocalizedText = Partial<Record<DesignLocale, string>>;
export type SettingValue = LocalizedText | string;

export interface DesignSection {
  id: string;
  type: string;
  enabled: boolean;
  settings: Record<string, SettingValue>;
}

export interface DesignBrand {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  fontId: string;
}

export interface DesignDocument {
  brand: DesignBrand;
  sections: DesignSection[];
}

export interface DesignError {
  path: string;
  message: string;
}

export type DesignValidation = { ok: true; document: DesignDocument } | { ok: false; errors: DesignError[] };

export interface StorefrontSection {
  id: string;
  type: string;
  settings: Record<string, string>;
}

export interface StorefrontBrand {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  fontFamily: string;
  fontUrl: string;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SECTION_ID = /^[a-z0-9_-]{1,40}$/;
const MAX_TEXT = { text: 200, textarea: 2000 } as const;
const MAX_URL = 2048;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isLinkTarget(value: string): boolean {
  return (value.startsWith("/") && !value.startsWith("//")) || value.startsWith("#") || isHttpUrl(value);
}

function settingValue(spec: SettingSpec, raw: unknown, path: string, errors: DesignError[]): SettingValue | undefined {
  if (spec.kind === "text" || spec.kind === "textarea") {
    if (!isRecord(raw)) {
      errors.push({ path, message: "expected a text per language" });
      return undefined;
    }
    const text: LocalizedText = {};
    for (const [locale, value] of Object.entries(raw)) {
      if (!(DESIGN_LOCALES as readonly string[]).includes(locale)) {
        errors.push({ path: `${path}.${locale}`, message: "unknown language" });
      } else if (typeof value !== "string") {
        errors.push({ path: `${path}.${locale}`, message: "expected text" });
      } else if (value.trim().length > MAX_TEXT[spec.kind]) {
        errors.push({ path: `${path}.${locale}`, message: `at most ${MAX_TEXT[spec.kind]} characters` });
      } else if (value.trim()) {
        text[locale as DesignLocale] = value.trim();
      }
    }
    return Object.keys(text).length > 0 ? text : undefined;
  }
  if (typeof raw !== "string") {
    errors.push({ path, message: "expected a link" });
    return undefined;
  }
  const value = raw.trim();
  if (!value) return undefined;
  const valid = value.length <= MAX_URL && (spec.kind === "image" ? isHttpUrl(value) : isLinkTarget(value));
  if (!valid) errors.push({ path, message: spec.kind === "image" ? "expected an http(s) image address" : "expected a link" });
  return valid ? value : undefined;
}

function validateBrand(raw: unknown, manifest: TemplateManifest, errors: DesignError[]): DesignBrand | null {
  if (!isRecord(raw)) {
    errors.push({ path: "brand", message: "expected an object" });
    return null;
  }
  for (const key of ["primaryColor", "accentColor", "bgColor"] as const) {
    if (typeof raw[key] !== "string" || !HEX.test(raw[key] as string)) errors.push({ path: `brand.${key}`, message: "expected a #rgb or #rrggbb colour" });
  }
  if (!manifest.brand.fonts.some((font) => font.id === raw.fontId)) errors.push({ path: "brand.fontId", message: "not a font this template offers" });
  const logo = raw.logoUrl;
  if (logo !== null && logo !== undefined && logo !== "" && (typeof logo !== "string" || logo.length > MAX_URL || !isHttpUrl(logo))) {
    errors.push({ path: "brand.logoUrl", message: "expected an http(s) image address" });
  }
  return {
    logoUrl: typeof logo === "string" && logo.trim() ? logo.trim() : null,
    primaryColor: String(raw.primaryColor),
    accentColor: String(raw.accentColor),
    bgColor: String(raw.bgColor),
    fontId: String(raw.fontId),
  };
}

export function validateDesign(input: unknown, manifest: TemplateManifest): DesignValidation {
  const errors: DesignError[] = [];
  if (!isRecord(input) || !Array.isArray(input.sections)) {
    return { ok: false, errors: [{ path: "", message: "expected { brand, sections[] }" }] };
  }
  const brand = validateBrand(input.brand, manifest, errors);
  const sections: DesignSection[] = [];
  const seenTypes = new Set<string>();
  const seenIds = new Set<string>();

  input.sections.forEach((raw, index) => {
    const path = `sections[${index}]`;
    if (!isRecord(raw)) {
      errors.push({ path, message: "expected an object" });
      return;
    }
    const spec = manifest.sections.find((s) => s.type === raw.type);
    if (!spec) {
      errors.push({ path: `${path}.type`, message: "not a section this template offers" });
      return;
    }
    if (seenTypes.has(spec.type)) errors.push({ path: `${path}.type`, message: "appears twice" });
    seenTypes.add(spec.type);
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!SECTION_ID.test(id) || seenIds.has(id)) errors.push({ path: `${path}.id`, message: "expected a unique id of letters, digits, - or _" });
    seenIds.add(id);
    if (typeof raw.enabled !== "boolean") errors.push({ path: `${path}.enabled`, message: "expected true or false" });
    if (spec.essential && raw.enabled === false) errors.push({ path: `${path}.enabled`, message: "an essential section cannot be hidden" });

    const settings: Record<string, SettingValue> = {};
    const rawSettings = raw.settings ?? {};
    if (!isRecord(rawSettings)) {
      errors.push({ path: `${path}.settings`, message: "expected an object" });
    } else {
      for (const [key, value] of Object.entries(rawSettings)) {
        const setting = spec.settings.find((s) => s.key === key);
        if (!setting) {
          errors.push({ path: `${path}.settings.${key}`, message: "not a setting of this section" });
          continue;
        }
        const parsed = settingValue(setting, value, `${path}.settings.${key}`, errors);
        if (parsed !== undefined) settings[key] = parsed;
      }
    }
    sections.push({ id, type: spec.type, enabled: raw.enabled !== false, settings });
  });

  for (const spec of manifest.sections) {
    if (seenTypes.has(spec.type)) continue;
    if (spec.essential) errors.push({ path: "sections", message: `the essential section "${spec.type}" is missing` });
    else sections.push({ id: uniqueId(spec.type, seenIds), type: spec.type, enabled: false, settings: {} });
  }

  if (errors.length > 0 || !brand) return { ok: false, errors };
  return { ok: true, document: { brand, sections } };
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

export function brandFromStore(
  store: { logoUrl: string | null; primaryColor: string; accentColor: string; bgColor: string; fontFamily: string },
  manifest: TemplateManifest,
): DesignBrand {
  const colour = (value: string, fallback: string) => (HEX.test(value) ? value : fallback);
  return {
    logoUrl: store.logoUrl,
    primaryColor: colour(store.primaryColor, "#7c3aed"),
    accentColor: colour(store.accentColor, "#f59e0b"),
    bgColor: colour(store.bgColor, "#f8f8f8"),
    fontId: (manifest.brand.fonts.find((font) => font.family === store.fontFamily) ?? manifest.brand.fonts[0]).id,
  };
}

export function defaultDesign(manifest: TemplateManifest, brand: DesignBrand): DesignDocument {
  return {
    brand,
    sections: manifest.sections.map((spec) => ({ id: spec.type, type: spec.type, enabled: true, settings: {} })),
  };
}

export function storefrontBrand(brand: DesignBrand, manifest: TemplateManifest): StorefrontBrand {
  const font = manifest.brand.fonts.find((f) => f.id === brand.fontId) ?? manifest.brand.fonts[0];
  return {
    logoUrl: brand.logoUrl,
    primaryColor: brand.primaryColor,
    accentColor: brand.accentColor,
    bgColor: brand.bgColor,
    fontFamily: font.family,
    fontUrl: font.url,
  };
}

export function storefrontSections(document: DesignDocument, lang: DesignLocale): StorefrontSection[] {
  return document.sections
    .filter((section) => section.enabled)
    .map((section) => {
      const settings: Record<string, string> = {};
      for (const [key, value] of Object.entries(section.settings)) {
        const resolved = typeof value === "string" ? value : value[lang];
        if (resolved) settings[key] = resolved;
      }
      return { id: section.id, type: section.type, settings };
    });
}
