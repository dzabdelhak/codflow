/**
 * Proves the templates survive the real sanitiser byte-for-byte — R5/R6 in
 * report-md/LEGAL_PAGES_PLAN.md.
 *
 * `sanitizeRichText`/`toPlainText` run the real lol-html engine (the
 * WebAssembly build of Cloudflare's HTMLRewriter), as in production.
 *
 * If a template ever used a tag or attribute the allow-list would strip,
 * this is the test that catches it: R5 claims the serializer emits nothing
 * else, and this is what makes that claim true rather than merely asserted.
 */

import { describe, expect, it } from "vitest";
import { LEGAL_PAGE_KINDS, PAGE_LOCALES } from "./kinds";
import type { LegalPageKind, PageLocale } from "./kinds";
import { TEMPLATES } from "./render";
import { serializeLegalDocument } from "./serialize";
import type { StoreLegalFacts } from "./types";
import { sanitizeRichText, toPlainText } from "../lib/rich-text";

const FUNCTIONS = { sanitizeRichText, toPlainText } as const;

async function call<T>(fn: keyof typeof FUNCTIONS, html: string): Promise<T> {
  return (await FUNCTIONS[fn](html)) as T;
}

const BARE: StoreLegalFacts = {
  storeName: "متجر تجريبي",
  legalName: null,
  rcNumber: null,
  nif: null,
  address: null,
  contactEmail: null,
  contactPhone: null,
  returnWindowDays: 0,
  deliveryMinDays: 2,
  deliveryMaxDays: 7,
};

const FULL: StoreLegalFacts = {
  storeName: "Boutique Test",
  legalName: "SARL Test Commerce",
  rcNumber: "16/00-1234567B25",
  nif: "000116001234567",
  address: "12 rue des Frères Bouadou, Bir Mourad Raïs, Alger",
  contactEmail: "contact@example.dz",
  contactPhone: "+213 555 00 00 00",
  returnWindowDays: 7,
  deliveryMinDays: 1,
  deliveryMaxDays: 5,
};

const CASES: ReadonlyArray<[PageLocale, LegalPageKind]> = PAGE_LOCALES.flatMap(
  (locale) => LEGAL_PAGE_KINDS.map((kind) => [locale, kind] as [PageLocale, LegalPageKind]),
);

describe("template output passes sanitizeRichText unchanged", () => {
  it.each(CASES)("%s / %s (bare facts)", async (locale, kind) => {
    const html = serializeLegalDocument(TEMPLATES[locale][kind](BARE));
    const { html: sanitised, removed } = await call<{ html: string; removed: unknown[] }>(
      "sanitizeRichText",
      html,
    );
    expect(removed, `sanitizer stripped something from ${locale}/${kind}`).toEqual([]);
    expect(sanitised).toBe(html);
  });

  it.each(CASES)("%s / %s (full facts)", async (locale, kind) => {
    const html = serializeLegalDocument(TEMPLATES[locale][kind](FULL));
    const { html: sanitised, removed } = await call<{ html: string; removed: unknown[] }>(
      "sanitizeRichText",
      html,
    );
    expect(removed, `sanitizer stripped something from ${locale}/${kind}`).toEqual([]);
    expect(sanitised).toBe(html);
  });
});

describe("toPlainText derives non-empty, tag-free body_plain", () => {
  it.each(CASES)("%s / %s", async (locale, kind) => {
    const html = serializeLegalDocument(TEMPLATES[locale][kind](FULL));
    const plain = await call<string>("toPlainText", html);
    expect(plain.length).toBeGreaterThan(100);
    expect(plain).not.toMatch(/<[a-z]/i);
  });
});
