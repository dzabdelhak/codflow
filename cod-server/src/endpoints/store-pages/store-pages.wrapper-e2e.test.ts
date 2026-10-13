/**
 * store-pages typed-error wrapper — real PostgreSQL E2E.
 *
 * Calls cod-server/src/endpoints/store-pages/queries.ts (the AppError
 * wrapper) on a connection pinned to each test's store. Proves
 * the wrapper's ADDED behaviour over cod-shared/queries/store-pages —
 * 404/409/422 mapping and the legal-kind delete guard — against the real
 * engine. Does NOT re-prove sanitisation depth: that is
 * cod-shared/queries/store-pages.e2e.test.ts's job (16 tests, already green).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppDb } from "@/db";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import * as q from "./queries";

interface WrapperError {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  context?: Record<string, unknown>;
}

let harness: TestDb;
const dbs = new Map<string, AppDb>();
let current: AppDb;

type Query = (...args: unknown[]) => Promise<unknown>;

/** Runs a wrapper query on the connection of the store named by its first argument. */
async function call<T>(fn: string, ...args: unknown[]): Promise<T> {
  const db = (typeof args[0] === "string" && dbs.get(args[0])) || current;
  const result = await (q as unknown as Record<string, Query>)[fn](db, ...args);
  return (result === undefined ? undefined : JSON.parse(JSON.stringify(result))) as T;
}

async function callErr(fn: string, ...args: unknown[]): Promise<WrapperError> {
  try {
    await call(fn, ...args);
  } catch (e) {
    const err = e as WrapperError;
    return { name: err.name, message: err.message, code: err.code, statusCode: err.statusCode, context: err.context };
  }
  throw new Error(`expected ${fn} to throw, it returned a result`);
}

async function insertStore(id: string, name: string) {
  await harness.createStore(id);
  await harness.platform.query("update stores set name = $2, lang = 'en' where id = $1", [id, name]);
  current = await harness.connect(id);
  dbs.set(id, current);
}

beforeAll(async () => {
  harness = await createTestDb();
}, 120_000);

afterAll(async () => {
  await harness?.dispose();
});

describe("getStorePageOrThrow", () => {
  it("throws NotFoundError (404) for an unknown id", async () => {
    await insertStore("w-store-1", "Store 1");
    const err = await callErr("getStorePageOrThrow", "w-store-1", "does-not-exist");
    expect(err.name).toBe("NotFoundError");
    expect(err.statusCode).toBe(404);
    expect(err.context).toMatchObject({ entity: "Store Page", id: "does-not-exist" });
  });

  it("throws NotFoundError for a page that belongs to a different store", async () => {
    await insertStore("w-store-2a", "Store 2a");
    await insertStore("w-store-2b", "Store 2b");
    const created = await call<{ id: string }>("createCustomPage", "w-store-2a", {
      slug: "faq", locale: "en", title: "FAQ", bodyHtml: "<p>x</p>",
    });
    const err = await callErr("getStorePageOrThrow", "w-store-2b", created.id);
    expect(err.name).toBe("NotFoundError");
  });
});

describe("createCustomPage — 409 on slug conflict", () => {
  it("succeeds with a full detail payload", async () => {
    await insertStore("w-store-3", "Store 3");
    const created = await call<{ id: string; slug: string; bodies: Record<string, unknown> }>(
      "createCustomPage",
      "w-store-3",
      { slug: "about", locale: "en", title: "About", bodyHtml: "<p>We sell things.</p>" },
    );
    expect(created.slug).toBe("about");
    expect(created.bodies).toHaveProperty("en");
  });

  it("throws ConflictError (409, DUPLICATE_ENTITY) on a taken slug", async () => {
    await insertStore("w-store-4", "Store 4");
    await call("createCustomPage", "w-store-4", { slug: "faq", locale: "en", title: "FAQ", bodyHtml: "<p>x</p>" });
    const err = await callErr("createCustomPage", "w-store-4", {
      slug: "faq", locale: "en", title: "FAQ 2", bodyHtml: "<p>y</p>",
    });
    expect(err.name).toBe("ConflictError");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("DUPLICATE_ENTITY");
    expect(err.context).toMatchObject({ slug: "faq" });
  });

  it("does not collide with the same slug used by a DIFFERENT store", async () => {
    await insertStore("w-store-5a", "Store 5a");
    await insertStore("w-store-5b", "Store 5b");
    await call("createCustomPage", "w-store-5a", { slug: "faq", locale: "en", title: "FAQ", bodyHtml: "<p>x</p>" });
    const created = await call<{ slug: string }>("createCustomPage", "w-store-5b", {
      slug: "faq", locale: "en", title: "FAQ", bodyHtml: "<p>x</p>",
    });
    expect(created.slug).toBe("faq");
  });
});

describe("updateStorePageMeta", () => {
  it("throws NotFoundError for a missing page", async () => {
    await insertStore("w-store-6", "Store 6");
    const err = await callErr("updateStorePageMeta", "w-store-6", "missing", { status: "draft" });
    expect(err.name).toBe("NotFoundError");
  });

  it("throws ConflictError when renamed to a slug already taken on the same store", async () => {
    await insertStore("w-store-7", "Store 7");
    await call("createCustomPage", "w-store-7", { slug: "terms-of-use", locale: "en", title: "T", bodyHtml: "<p>x</p>" });
    const second = await call<{ id: string }>("createCustomPage", "w-store-7", {
      slug: "faq", locale: "en", title: "FAQ", bodyHtml: "<p>x</p>",
    });
    const err = await callErr("updateStorePageMeta", "w-store-7", second.id, { slug: "terms-of-use" });
    expect(err.name).toBe("ConflictError");
    expect(err.statusCode).toBe(409);
  });

  it("succeeds when the slug is unchanged (does not conflict with itself)", async () => {
    await insertStore("w-store-8", "Store 8");
    const created = await call<{ id: string }>("createCustomPage", "w-store-8", {
      slug: "faq", locale: "en", title: "FAQ", bodyHtml: "<p>x</p>",
    });
    const updated = await call<{ status: string }>("updateStorePageMeta", "w-store-8", created.id, {
      slug: "faq", status: "published",
    });
    expect(updated.status).toBe("published");
  });
});

describe("deleteStorePage — the legal-kind guard", () => {
  it("throws BusinessLogicError (422, STORE_PAGE_CANNOT_DELETE_LEGAL) for a legal kind", async () => {
    await insertStore("w-store-9", "Store 9");
    await call("seedStorePages", "w-store-9");
    const pages = await call<Array<{ id: string; kind: string }>>("listStorePages", "w-store-9");
    const terms = pages.find((p) => p.kind === "terms")!;

    const err = await callErr("deleteStorePage", "w-store-9", terms.id);
    expect(err.name).toBe("BusinessLogicError");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("STORE_PAGE_CANNOT_DELETE_LEGAL");
    expect(err.context).toMatchObject({ kind: "terms" });
  });

  it("succeeds for a custom page", async () => {
    await insertStore("w-store-10", "Store 10");
    const created = await call<{ id: string }>("createCustomPage", "w-store-10", {
      slug: "temp", locale: "en", title: "Temp", bodyHtml: "<p>x</p>",
    });
    await call("deleteStorePage", "w-store-10", created.id);
    const err = await callErr("getStorePageOrThrow", "w-store-10", created.id);
    expect(err.name).toBe("NotFoundError");
  });

  it("throws NotFoundError before the guard for a missing id", async () => {
    await insertStore("w-store-11", "Store 11");
    const err = await callErr("deleteStorePage", "w-store-11", "missing");
    expect(err.name).toBe("NotFoundError");
  });
});

describe("saveTranslation — must resolve to an existing page", () => {
  it("throws NotFoundError for a missing page id", async () => {
    await insertStore("w-store-12", "Store 12");
    const err = await callErr("saveTranslation", "w-store-12", "missing", "en", {
      title: "X", bodyHtml: "<p>x</p>",
    });
    expect(err.name).toBe("NotFoundError");
  });

  it("succeeds and flips source to merchant", async () => {
    await insertStore("w-store-13", "Store 13");
    const created = await call<{ id: string }>("createCustomPage", "w-store-13", {
      slug: "faq", locale: "en", title: "FAQ", bodyHtml: "<p>x</p>",
    });
    const saved = await call<{ source: string }>("saveTranslation", "w-store-13", created.id, "en", {
      title: "FAQ v2", bodyHtml: "<p>updated</p>",
    });
    expect(saved.source).toBe("merchant");
  });
});

describe("resetTranslationToTemplate — the custom-page guard", () => {
  it("throws BusinessLogicError (422, STORE_PAGE_NOT_LEGAL) for a custom page", async () => {
    await insertStore("w-store-14", "Store 14");
    const created = await call<{ id: string }>("createCustomPage", "w-store-14", {
      slug: "faq", locale: "en", title: "FAQ", bodyHtml: "<p>x</p>",
    });
    const err = await callErr("resetTranslationToTemplate", "w-store-14", created.id, "en");
    expect(err.name).toBe("BusinessLogicError");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("STORE_PAGE_NOT_LEGAL");
  });

  it("succeeds for a legal kind", async () => {
    await insertStore("w-store-15", "Store 15");
    await call("seedStorePages", "w-store-15");
    const pages = await call<Array<{ id: string; kind: string }>>("listStorePages", "w-store-15");
    const terms = pages.find((p) => p.kind === "terms")!;
    await call("saveTranslation", "w-store-15", terms.id, "en", { title: "Custom", bodyHtml: "<p>x</p>" });
    const reset = await call<{ source: string; title: string }>(
      "resetTranslationToTemplate", "w-store-15", terms.id, "en",
    );
    expect(reset.source).toBe("template");
    expect(reset.title).toBe("Terms and Conditions");
  });

  it("throws NotFoundError before the guard for a missing page", async () => {
    await insertStore("w-store-16", "Store 16");
    const err = await callErr("resetTranslationToTemplate", "w-store-16", "missing", "en");
    expect(err.name).toBe("NotFoundError");
  });
});
