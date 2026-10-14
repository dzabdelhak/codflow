import { describe, expect, it } from "vitest";
import { defaultDesign } from "../../../../cod-shared/channels/design";
import { THEME01_MANIFEST } from "../../../../cod-shared/channels/manifests";
import {
  moveSection,
  previewUrl,
  sameDocument,
  setSectionShown,
  setSettingLink,
  setSettingText,
  settingText,
} from "./model";

const brand = { logoUrl: null, primaryColor: "#7c3aed", accentColor: "#f59e0b", bgColor: "#f8f8f8", fontId: "cairo" };
const doc = () => defaultDesign(THEME01_MANIFEST, brand);

describe("design editing", () => {
  it("reorders sections and stops at the ends", () => {
    const moved = moveSection(doc(), 0, 1);
    expect(moved.sections.slice(0, 2).map((s) => s.type)).toEqual(["categories", "hero"]);
    expect(moveSection(doc(), 0, -1)).toEqual(doc());
  });

  it("hides a section but never an essential one", () => {
    expect(setSectionShown(doc(), THEME01_MANIFEST, "hero", false).sections[0].enabled).toBe(false);
    expect(setSectionShown(doc(), THEME01_MANIFEST, "best_sellers", false).sections[2].enabled).toBe(true);
  });

  it("edits a text per language and forgets emptied ones", () => {
    let edited = setSettingText(doc(), "hero", "heroTitle", "ar", "مرحبا");
    edited = setSettingText(edited, "hero", "heroTitle", "fr", "Bonjour");
    expect(settingText(edited.sections[0], "heroTitle", "fr")).toBe("Bonjour");
    edited = setSettingText(setSettingText(edited, "hero", "heroTitle", "ar", ""), "hero", "heroTitle", "fr", "");
    expect(edited.sections[0].settings).toEqual({});
    expect(setSettingLink(setSettingLink(doc(), "hero", "heroCtaHref", "/sale"), "hero", "heroCtaHref", "").sections[0].settings).toEqual({});
    expect(sameDocument(edited, doc())).toBe(true);
  });

  it("builds the preview address on the channel's host, same scheme and port", () => {
    expect(previewUrl({ protocol: "http:", port: "8090" }, "shop1.localhost", "a+b")).toBe("http://shop1.localhost:8090/?preview=a%2Bb");
    expect(previewUrl({ protocol: "https:", port: "" }, "nour.codflow.app", "t")).toBe("https://nour.codflow.app/?preview=t");
  });
});
