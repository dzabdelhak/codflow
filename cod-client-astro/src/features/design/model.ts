import type { DesignBrand, DesignDocument, DesignSection, LocalizedText } from "../../../../cod-shared/channels/design";
import type { DesignLocale, SectionSpec, TemplateManifest } from "../../../../cod-shared/channels/manifests";

export function sectionSpec(manifest: TemplateManifest, type: string): SectionSpec | undefined {
  return manifest.sections.find((spec) => spec.type === type);
}

export function moveSection(document: DesignDocument, index: number, delta: -1 | 1): DesignDocument {
  const target = index + delta;
  if (target < 0 || target >= document.sections.length) return document;
  const sections = [...document.sections];
  [sections[index], sections[target]] = [sections[target], sections[index]];
  return { ...document, sections };
}

function updateSection(document: DesignDocument, id: string, change: (section: DesignSection) => DesignSection): DesignDocument {
  return { ...document, sections: document.sections.map((section) => (section.id === id ? change(section) : section)) };
}

export function setSectionShown(document: DesignDocument, manifest: TemplateManifest, id: string, enabled: boolean): DesignDocument {
  return updateSection(document, id, (section) =>
    sectionSpec(manifest, section.type)?.essential ? section : { ...section, enabled },
  );
}

export function settingText(section: DesignSection, key: string, locale: DesignLocale): string {
  const value = section.settings[key];
  return typeof value === "object" && value ? (value[locale] ?? "") : "";
}

export function settingLink(section: DesignSection, key: string): string {
  const value = section.settings[key];
  return typeof value === "string" ? value : "";
}

export function setSettingText(document: DesignDocument, id: string, key: string, locale: DesignLocale, text: string): DesignDocument {
  return updateSection(document, id, (section) => {
    const current = section.settings[key];
    const next: LocalizedText = { ...(typeof current === "object" && current ? current : {}), [locale]: text };
    if (!text) delete next[locale];
    const settings = { ...section.settings, [key]: next };
    if (Object.keys(next).length === 0) delete settings[key];
    return { ...section, settings };
  });
}

export function setSettingLink(document: DesignDocument, id: string, key: string, value: string): DesignDocument {
  return updateSection(document, id, (section) => {
    const settings = { ...section.settings, [key]: value };
    if (!value) delete settings[key];
    return { ...section, settings };
  });
}

export function setBrand(document: DesignDocument, change: Partial<DesignBrand>): DesignDocument {
  return { ...document, brand: { ...document.brand, ...change } };
}

export function sameDocument(a: DesignDocument, b: DesignDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function previewUrl(location: Pick<Location, "protocol" | "port">, hostname: string, token: string): string {
  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//${hostname}${port}/?preview=${encodeURIComponent(token)}`;
}
