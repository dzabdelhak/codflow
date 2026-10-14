import { describe, expect, it } from "vitest";
import { validateDesign } from "./design";
import { manifestFor } from "./manifests";
import { CHANNEL_TEMPLATES, defaultTemplateFor, isTemplateFor, presetBrand, templateDesign } from "./templates";

const brand = { logoUrl: null, primaryColor: "#000000", accentColor: "#ffffff", bgColor: "#eeeeee", fontId: "cairo" };

describe("ready-made templates", () => {
  it.each(CHANNEL_TEMPLATES.map((t) => [t.id, t] as const))("%s is a valid design of its base template", (_id, template) => {
    const manifest = manifestFor(template.id, template.type);
    const design = templateDesign(template.id, manifest, brand);
    const result = validateDesign(design, manifest);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(design.sections.map((s) => s.type).sort()).toEqual(manifest.sections.map((s) => s.type).sort());
    expect(presetBrand(template.id, manifest)?.fontFamily).toBe(manifest.brand.fonts.find((f) => f.id === template.preset.brand.fontId)?.family);
  });

  it("offers three store templates and two landing templates, the classic ones first", () => {
    expect(CHANNEL_TEMPLATES.filter((t) => t.type === "store")).toHaveLength(3);
    expect(CHANNEL_TEMPLATES.filter((t) => t.type === "landing")).toHaveLength(2);
    expect(defaultTemplateFor("store")).toBe("theme01");
    expect(defaultTemplateFor("landing")).toBe("landing01");
    expect(isTemplateFor("landing", "boutique")).toBe(false);
    expect(isTemplateFor("store", "boutique")).toBe(true);
  });

  it("keeps the preset's order, visibility and texts", () => {
    const design = templateDesign("boutique", manifestFor("boutique", "store"), brand);
    expect(design.sections[0]).toMatchObject({ type: "hero", enabled: true, settings: { heroTitle: { fr: "L'élégance au quotidien" } } });
    expect(design.sections.find((s) => s.type === "how_it_works")?.enabled).toBe(false);
  });

  it("falls back to the base template's default for an unknown id", () => {
    const manifest = manifestFor("gone", "store");
    expect(templateDesign("gone", manifest, brand).sections.map((s) => s.type)).toEqual(manifest.sections.map((s) => s.type));
  });
});
