import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ar } from "@/theme/content/ar";
import { LANDING_SECTIONS, STORE_HOME_SECTIONS } from "@/theme/utils/sections";
import { LANDING01_MANIFEST, THEME01_MANIFEST, type TemplateManifest } from "../../../../cod-shared/channels/manifests";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

const templates: Array<{ manifest: TemplateManifest; defaults: readonly string[]; renderer: string }> = [
  { manifest: THEME01_MANIFEST, defaults: STORE_HOME_SECTIONS, renderer: read("../pages/index.astro") },
  { manifest: LANDING01_MANIFEST, defaults: LANDING_SECTIONS, renderer: read("components/landing/LandingPage.astro") },
];

describe.each(templates)("the $manifest.templateId manifest", ({ manifest, defaults, renderer }) => {
  it("declares exactly the sections the page renders, in the default order", () => {
    expect(manifest.sections.map((s) => s.type)).toEqual([...defaults]);
    for (const { type } of manifest.sections) expect(renderer).toContain(`section.type === "${type}"`);
  });

  it("declares only texts the theme knows, in every language", () => {
    const texts = manifest.sections.flatMap((s) => s.settings.filter((x) => x.kind === "text" || x.kind === "textarea"));
    for (const { key } of texts) expect(ar, key).toHaveProperty(key);
  });

  it("applies every link and image it declares", () => {
    const others = manifest.sections.flatMap((s) => s.settings.filter((x) => x.kind === "url" || x.kind === "image"));
    for (const { key } of others) expect(renderer, key).toContain(key);
  });
});
