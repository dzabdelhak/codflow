/**
 * store-pages write chokepoint — real PostgreSQL, real sanitizer E2E.
 *
 * Each store gets its own connection pinned to it (Row-Level Security on),
 * exactly as a request would. Proves:
 *
 *   • seedStorePages creates all 4 legal kinds × 3 locales, is idempotent
 *   • hostile HTML in a merchant save is sanitised before it reaches D1
 *   • saveTranslation flips source to "merchant"; reset flips it back
 *   • resolvePublishedPage's locale fallback chain (exact → ar → any)
 *   • draft pages resolve to null (the caller 404s, never a soft 200)
 *   • slugExists / uniqueSlug collision handling
 *   • getFooterPages returns only published + showInFooter, in position order
 *   • deleteStorePage and the legal-profile upsert round-trip
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import type { AppDb } from "../db/client";
import * as q from "./store-pages";

let harness: TestDb;
const dbs = new Map<string, AppDb>();
let current: AppDb;

/**
 * Calls a store-pages query on the connection of the store named by its first
 * argument, or of the store created last. Results go through JSON, as they
 * would on their way to a client.
 */
async function call<T>(fn: string, ...args: unknown[]): Promise<T> {
  const db = (typeof args[0] === "string" && dbs.get(args[0])) || current;
  const result = await (q as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[fn](db, ...args);
  return (result === undefined ? undefined : JSON.parse(JSON.stringify(result))) as T;
}

async function insertStore(id: string, name: string, lang: "ar" | "en" | "fr" = "ar") {
  await harness.createStore(id);
  await harness.platform.query("update stores set name = $2, lang = $3 where id = $1", [id, name, lang]);
  current = await harness.connect(id);
  dbs.set(id, current);
}

beforeAll(async () => {
  harness = await createTestDb();
}, 120_000);

afterAll(async () => {
  await harness?.dispose();
});

const HOSTILE_HTML =
  '<p>Return within <strong>7 days</strong></p><script>alert(1)</script>' +
  '<img src="https://m.example/i.jpg" alt="x" onerror="alert(1)">' +
  '<a href="javascript:alert(1)">bad</a>';

function assertClean(value: unknown): void {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  expect(s, "hostile payload leaked").not.toContain("<script");
  expect(s, "hostile payload leaked").not.toContain("onerror=");
  expect(s, "hostile payload leaked").not.toContain("javascript:");
}

describe("seedStorePages", () => {
  it("creates all 4 legal kinds, each with 3 locale translations, source=template", async () => {
    await insertStore("seed-store-1", "متجر البذور");
    const seeded = await call<{ created: string[] }>("seedStorePages", "seed-store-1");
    expect(seeded.created.sort()).toEqual(["privacy", "refund", "shipping", "terms"]);

    const pages = await call<Array<{ kind: string; translations: Array<{ locale: string; source: string }> }>>(
      "listStorePages",
      "seed-store-1",
    );
    expect(pages).toHaveLength(4);
    for (const page of pages) {
      expect(page.translations.map((t) => t.locale).sort()).toEqual(["ar", "en", "fr"]);
      expect(page.translations.every((t) => t.source === "template")).toBe(true);
    }
  });

  it("is idempotent: seeding twice does not duplicate pages", async () => {
    await insertStore("seed-store-2", "Boutique Idempotente");
    await call("seedStorePages", "seed-store-2");
    const second = await call<{ created: string[] }>("seedStorePages", "seed-store-2");
    expect(second.created).toEqual([]);

    const pages = await call<unknown[]>("listStorePages", "seed-store-2");
    expect(pages).toHaveLength(4);
  });

  it("gives each store's pages independent unique slugs, unaffected by another store's slugs", async () => {
    await insertStore("seed-store-3", "Boutique A");
    await insertStore("seed-store-4", "Boutique B");
    await call("seedStorePages", "seed-store-3");
    await call("seedStorePages", "seed-store-4");

    const a = await call<Array<{ slug: string }>>("listStorePages", "seed-store-3");
    const b = await call<Array<{ slug: string }>>("listStorePages", "seed-store-4");
    expect(a.map((p) => p.slug).sort()).toEqual(b.map((p) => p.slug).sort());
  });
});

describe("write chokepoint (saveTranslation)", () => {
  it("sanitises hostile HTML before it reaches D1, and flips source to merchant", async () => {
    await insertStore("write-store-1", "Test Store", "en");
    await call("seedStorePages", "write-store-1");
    const pages = await call<Array<{ id: string; kind: string }>>("listStorePages", "write-store-1");
    const refund = pages.find((p) => p.kind === "refund")!;

    const saved = await call<{ bodyHtml: string; bodyPlain: string; source: string }>(
      "saveTranslation",
      refund.id,
      "en",
      { title: "Refund Policy", bodyHtml: HOSTILE_HTML },
    );

    assertClean(saved.bodyHtml);
    assertClean(saved.bodyPlain);
    expect(saved.source).toBe("merchant");
    expect(saved.bodyHtml).toContain("<strong>7 days</strong>");

    const detail = await call<{ bodies: Record<string, { source: string; bodyHtml: string }> }>(
      "getStorePageById",
      "write-store-1",
      refund.id,
    );
    expect(detail.bodies.en.source).toBe("merchant");
    assertClean(detail.bodies.en.bodyHtml);
  });

  it("resetTranslationToTemplate re-renders from the template and flips source back", async () => {
    await insertStore("write-store-2", "Reset Store", "en");
    await call("seedStorePages", "write-store-2");
    const pages = await call<Array<{ id: string; kind: string }>>("listStorePages", "write-store-2");
    const terms = pages.find((p) => p.kind === "terms")!;

    await call("saveTranslation", terms.id, "en", { title: "Custom Title", bodyHtml: "<p>merchant text</p>" });
    const reset = await call<{ source: string; title: string }>(
      "resetTranslationToTemplate",
      "write-store-2",
      terms.id,
      "en",
    );
    expect(reset.source).toBe("template");
    expect(reset.title).toBe("Terms and Conditions");
  });

  it("resetTranslationToTemplate returns null for a custom page (no template to reset to)", async () => {
    await insertStore("write-store-3", "Custom Store", "en");
    const created = await call<{ id: string; slug: string }>("createCustomPage", "write-store-3", {
      slug: "faq",
      locale: "en",
      title: "FAQ",
      bodyHtml: "<p>Q and A</p>",
    });
    const result = await call("resetTranslationToTemplate", "write-store-3", created.id, "en");
    expect(result).toBeNull();
  });
});

describe("resolvePublishedPage — locale fallback and draft gating", () => {
  it("serves the exact requested locale when it exists", async () => {
    await insertStore("resolve-store-1", "Resolve Store", "en");
    await call("seedStorePages", "resolve-store-1");
    const resolved = await call<{ locale: string; title: string }>(
      "resolvePublishedPage",
      "resolve-store-1",
      "terms",
      "fr",
    );
    expect(resolved.locale).toBe("fr");
    expect(resolved.title).toBe("Conditions générales de vente");
  });

  it("falls back to ar when the requested locale has no translation (custom page)", async () => {
    await insertStore("resolve-store-2", "Resolve Store 2", "ar");
    const created = await call<{ id: string; slug: string }>("createCustomPage", "resolve-store-2", {
      slug: "about",
      locale: "ar",
      title: "من نحن",
      bodyHtml: "<p>نبذة</p>",
      showInFooter: false,
    });
    await call("updateStorePageMeta", "resolve-store-2", created.id, { status: "published" });

    const resolved = await call<{ locale: string; title: string } | null>(
      "resolvePublishedPage",
      "resolve-store-2",
      "about",
      "fr",
    );
    expect(resolved?.locale).toBe("ar");
    expect(resolved?.title).toBe("من نحن");
  });

  it("returns null for a draft page — never a soft 200", async () => {
    await insertStore("resolve-store-3", "Draft Store", "en");
    const created = await call<{ id: string; slug: string }>("createCustomPage", "resolve-store-3", {
      slug: "coming-soon",
      locale: "en",
      title: "Coming Soon",
      bodyHtml: "<p>...</p>",
    });
    const resolved = await call("resolvePublishedPage", "resolve-store-3", created.slug, "en");
    expect(resolved).toBeNull();
  });

  it("returns null for an unknown slug", async () => {
    await insertStore("resolve-store-4", "Empty Store", "en");
    const resolved = await call("resolvePublishedPage", "resolve-store-4", "does-not-exist", "en");
    expect(resolved).toBeNull();
  });
});

describe("getFooterPages", () => {
  it("returns only published + showInFooter pages, in position order, titled in the requested locale", async () => {
    await insertStore("footer-store-1", "Footer Store", "en");
    await call("seedStorePages", "footer-store-1");

    const hiddenPage = await call<{ id: string }>("createCustomPage", "footer-store-1", {
      slug: "hidden",
      locale: "en",
      title: "Hidden",
      bodyHtml: "<p>x</p>",
      showInFooter: false,
    });
    await call("updateStorePageMeta", "footer-store-1", hiddenPage.id, { status: "published" });

    // A page created via createCustomPage starts as 'draft' regardless of
    // showInFooter — draft must never leak into the footer.
    await call<{ id: string }>("createCustomPage", "footer-store-1", {
      slug: "draft-in-footer",
      locale: "en",
      title: "Draft",
      bodyHtml: "<p>x</p>",
      showInFooter: true,
    });

    const footer = await call<Array<{ slug: string; title: string; position: number }>>(
      "getFooterPages",
      "footer-store-1",
      "en",
    );
    const slugs = footer.map((f) => f.slug);
    expect(slugs).toEqual(["terms", "privacy", "refund-policy", "shipping-policy"]);
    expect(slugs).not.toContain("hidden");
    expect(slugs).not.toContain("draft-in-footer");
    expect(footer.every((f) => f.title.length > 0)).toBe(true);
  });
});

describe("slug collision handling", () => {
  it("uniqueSlug (via seedStorePages) never collides within a store", async () => {
    await insertStore("slug-store-1", "Slug Store", "en");
    const first = await call<{ id: string; slug: string }>("createCustomPage", "slug-store-1", {
      slug: "terms",
      locale: "en",
      title: "Manual Terms",
      bodyHtml: "<p>x</p>",
    });
    expect(first.slug).toBe("terms");

    // seedStorePages must still land its legal "terms" page under a free slug.
    await call("seedStorePages", "slug-store-1");
    const pages = await call<Array<{ kind: string; slug: string }>>("listStorePages", "slug-store-1");
    const legalTerms = pages.find((p) => p.kind === "terms")!;
    expect(legalTerms.slug).not.toBe("terms");
    expect(legalTerms.slug).toMatch(/^terms-\d+$/);
  });

  it("slugExists respects excludeId (a page does not collide with itself)", async () => {
    await insertStore("slug-store-2", "Slug Store 2", "en");
    const created = await call<{ id: string; slug: string }>("createCustomPage", "slug-store-2", {
      slug: "help",
      locale: "en",
      title: "Help",
      bodyHtml: "<p>x</p>",
    });
    const withoutExclude = await call<boolean>("slugExists", "slug-store-2", "help");
    const withExclude = await call<boolean>("slugExists", "slug-store-2", "help", created.id);
    expect(withoutExclude).toBe(true);
    expect(withExclude).toBe(false);
  });
});

describe("deleteStorePage", () => {
  it("removes the page and cascades its translations", async () => {
    await insertStore("delete-store-1", "Delete Store", "en");
    const created = await call<{ id: string }>("createCustomPage", "delete-store-1", {
      slug: "temp",
      locale: "en",
      title: "Temp",
      bodyHtml: "<p>x</p>",
    });
    await call("deleteStorePage", "delete-store-1", created.id);
    const after = await call("getStorePageById", "delete-store-1", created.id);
    expect(after).toBeNull();
  });
});

describe("legal profile", () => {
  it("upserts and reads back, and seeding reflects the profile's facts", async () => {
    await insertStore("profile-store-1", "Profile Store", "en");
    await call("upsertLegalProfile", "profile-store-1", {
      contactEmail: "help@example.dz",
      contactPhone: "+213 555 11 22 33",
      returnWindowDays: 5,
      deliveryMinDays: 2,
      deliveryMaxDays: 4,
    });

    const profile = await call<{ contactEmail: string; returnWindowDays: number }>(
      "getLegalProfile",
      "profile-store-1",
    );
    expect(profile.contactEmail).toBe("help@example.dz");
    expect(profile.returnWindowDays).toBe(5);

    await call("seedStorePages", "profile-store-1");
    const resolved = await call<{ bodyHtml: string }>(
      "resolvePublishedPage",
      "profile-store-1",
      "refund-policy",
      "en",
    );
    expect(resolved.bodyHtml).toContain("within 5 days");
    expect(resolved.bodyHtml).toContain("help@example.dz");
  });

  it("getPublicLegalContact exposes only the safe subset (no RC/NIF)", async () => {
    await insertStore("profile-store-2", "Profile Store 2", "en");
    await call("upsertLegalProfile", "profile-store-2", {
      rcNumber: "16/00-9999999B25",
      nif: "000116009999999",
      contactEmail: "c@example.dz",
      deliveryMinDays: 1,
      deliveryMaxDays: 3,
    });
    const publicContact = await call<Record<string, unknown>>("getPublicLegalContact", "profile-store-2");
    expect(publicContact).toEqual({
      contactEmail: "c@example.dz",
      contactPhone: null,
      deliveryMinDays: 1,
      deliveryMaxDays: 3,
    });
    expect(publicContact).not.toHaveProperty("rcNumber");
    expect(publicContact).not.toHaveProperty("nif");
  });
});
