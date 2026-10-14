/**
 * Channel design (ticket 09), on PostgreSQL through the real auth, dashboard
 * scope and storefront resolution: the storefront renders the published
 * section-state document, a draft stays invisible until published or
 * previewed, and publishing versions the document.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { createPool, type Database } from "@/db/scope";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { storeAuthMiddleware } from "@/middleware/storeAuth";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import storeRoutes from "../store/routes";
import channelDesignRoutes from "./routes";

const KEY = "storefront-design-key";
let harness: TestDb;
let database: Database;
let store: string;
let other: string;

const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.use("/store/*", storeAuthMiddleware);
app.route("/api/channel-design", channelDesignRoutes);
app.route("/store", storeRoutes);

const env = () => ({ DATABASE: database, STOREFRONT_SERVICE_KEY: KEY }) as never;

type Section = { id: string; type: string; enabled: boolean; settings: Record<string, unknown> };
type Doc = { brand: Record<string, unknown>; sections: Section[] };
type State = { current: Doc; draft: { document: Doc } | null; published: { version: number } | null; versions: Array<{ version: number }> };

async function dashboard(method: string, path: string, body?: unknown, storeId = store) {
  const res = await app.request(
    path,
    {
      method,
      headers: { "X-API-Key": "key-designer", "Content-Type": "application/json", "X-Store-Id": storeId },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env(),
  );
  return { status: res.status, json: (await res.json()) as { data: State } & Record<string, unknown> };
}

async function storefront(path: string, previewToken?: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { "X-Storefront-Key": KEY, "X-Channel-Host": "design-shop.codflow.test", "Content-Type": "application/json" };
  if (previewToken) headers["X-Preview-Token"] = previewToken;
  return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env());
}

async function publicConfig(previewToken?: string) {
  const res = await storefront("/store/config", previewToken);
  return { status: res.status, data: res.status === 200 ? ((await res.json()) as { data: Record<string, any> }).data : null };
}

beforeAll(async () => {
  harness = await createTestDb();
  store = await harness.createStore("design-shop", ["design-shop.codflow.test"]);
  other = await harness.createStore("design-other", ["design-other.codflow.test"]);
  await harness.platform.query(
    `insert into users (id, name, email, role, api_key, merchant_id, created_at, updated_at)
     values ('u-designer', 'Designer', 'designer@x.test', 'admin', 'key-designer', 'test-merchant', now(), now())`,
  );
  await harness.platform.query("update stores set status = 'draft', primary_color = '#111111' where id = $1", [store]);
  await harness.platform.query(
    `insert into store_pixel_config (id, store_id, pixel_id, access_token, created_at, updated_at)
     values ('pixel-design', $1, '1234567890', 'test-token', '', '')`,
    [store],
  );
  const appPool = createPool(harness.url, "codflow_app");
  const platform = createPool(harness.url, "codflow_platform");
  database = { app: appPool, platform, close: async () => void (await Promise.all([appPool.end(), platform.end()])) };
}, 120_000);

afterAll(async () => {
  await database?.close();
  await harness?.dispose();
});

let draft: Doc;

describe("a channel never designed", () => {
  it("edits and renders its template's default document", async () => {
    const { json } = await dashboard("GET", "/api/channel-design");
    expect(json.data).toMatchObject({ draft: null, published: null, versions: [] });
    expect(json.data.current.sections.map((s) => s.type)).toEqual([
      "hero", "categories", "best_sellers", "how_it_works", "new_arrivals", "features", "promo", "testimonials",
    ]);
    expect(json.data.current.brand).toMatchObject({ primaryColor: "#111111", fontId: "cairo" });

    await harness.platform.query("update stores set status = 'published' where id = $1", [store]);
    const config = await publicConfig();
    expect(config.data!.design).toMatchObject({ version: 0, preview: false });
    expect(config.data!.design.sections.map((s: Section) => s.type)).toContain("hero");
    await harness.platform.query("update stores set status = 'draft' where id = $1", [store]);
  });
});

describe("a draft", () => {
  it("is saved only when it matches the manifest", async () => {
    const current = (await dashboard("GET", "/api/channel-design")).json.data.current;
    const hiddenEssential = {
      ...current,
      sections: current.sections.map((s) => (s.type === "best_sellers" ? { ...s, enabled: false } : s)),
    };
    const refused = await dashboard("PUT", "/api/channel-design/draft", { document: hiddenEssential });
    expect(refused.status).toBe(400);
    expect(refused.json).toMatchObject({ context: { errors: [{ message: "an essential section cannot be hidden" }] } });

    draft = {
      brand: { ...current.brand, primaryColor: "#00aa55", fontId: "tajawal" },
      sections: [
        ...current.sections.filter((s) => s.type !== "hero"),
        { ...current.sections[0], enabled: false },
      ].map((s) => (s.type === "promo" ? { ...s, settings: { promoTitle: { ar: "تخفيضات", fr: "Soldes" } } } : s)),
    };
    const saved = await dashboard("PUT", "/api/channel-design/draft", { document: draft });
    expect(saved.status).toBe(200);
    expect(saved.json.data.draft?.document.brand.primaryColor).toBe("#00aa55");
  });

  it("stays invisible publicly, and shows in a preview — even before the channel is published", async () => {
    expect((await publicConfig()).status).toBe(404);

    const { json } = await dashboard("POST", "/api/channel-design/preview");
    const { token, hostname } = json.data as unknown as { token: string; hostname: string };
    expect(hostname).toBe("design-shop.codflow.test");

    const preview = await publicConfig(token);
    expect(preview.status).toBe(200);
    expect(preview.data!.design.preview).toBe(true);
    expect(preview.data!.design.sections.map((s: Section) => s.type)).not.toContain("hero");
    expect(preview.data!.design.sections.find((s: Section) => s.type === "promo").settings).toEqual({ promoTitle: "تخفيضات" });
    expect(preview.data).toMatchObject({ primaryColor: "#00aa55", fontFamily: "Tajawal, sans-serif", pixelId: null });

    expect((await storefront("/store/orders", token, "POST", {})).status).toBe(404);
    const forOther = (await dashboard("POST", "/api/channel-design/preview", undefined, other)).json.data as unknown as { token: string };
    expect((await publicConfig(forOther.token)).status).toBe(404);

    await harness.platform.query("update stores set status = 'published' where id = $1", [store]);
    const live = await publicConfig();
    expect(live.data!.design.sections.map((s: Section) => s.type)).toContain("hero");
    expect(live.data).toMatchObject({ primaryColor: "#111111", pixelId: "1234567890" });
  });
});

describe("publishing", () => {
  it("bumps the version, renders the document publicly and applies its brand to the channel", async () => {
    const res = await dashboard("POST", "/api/channel-design/publish");
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ draft: null, published: { version: 1 }, versions: [{ version: 1 }] });

    const live = await publicConfig();
    expect(live.data!.design).toMatchObject({ version: 1, preview: false });
    expect(live.data!.design.sections.map((s: Section) => s.type)).not.toContain("hero");
    expect(live.data).toMatchObject({ primaryColor: "#00aa55", fontFamily: "Tajawal, sans-serif" });
    const { rows: [row] } = await harness.platform.query("select primary_color, font_url from stores where id = $1", [store]);
    expect(row.primary_color).toBe("#00aa55");
    expect(row.font_url).toContain("Tajawal");

    expect((await dashboard("POST", "/api/channel-design/publish")).status).toBe(409);
  });

  it("can return to the last published version, or restore an older one into the draft", async () => {
    const second = { ...draft, sections: draft.sections.map((s) => ({ ...s, enabled: true })) };
    await dashboard("PUT", "/api/channel-design/draft", { document: second });
    expect((await dashboard("POST", "/api/channel-design/publish")).json.data.published).toMatchObject({ version: 2 });
    expect((await publicConfig()).data!.design.sections.map((s: Section) => s.type)).toContain("hero");

    await dashboard("PUT", "/api/channel-design/draft", { document: { ...second, brand: { ...second.brand, primaryColor: "#ff0000" } } });
    const discarded = await dashboard("DELETE", "/api/channel-design/draft");
    expect(discarded.json.data.draft).toBeNull();
    expect(discarded.json.data.current.brand.primaryColor).toBe("#00aa55");

    const restored = await dashboard("POST", "/api/channel-design/restore", { version: 1 });
    expect(restored.json.data.draft?.document.sections.find((s) => s.type === "hero")?.enabled).toBe(false);
    expect((await dashboard("POST", "/api/channel-design/publish")).json.data.published).toMatchObject({ version: 3 });
    expect((await dashboard("POST", "/api/channel-design/restore", { version: 99 })).status).toBe(404);
  });

  it("shows a brand changed outside the editor, publicly and in the editor", async () => {
    await harness.platform.query("update stores set primary_color = '#222222' where id = $1", [store]);
    expect((await publicConfig()).data!.primaryColor).toBe("#222222");
    expect((await dashboard("GET", "/api/channel-design")).json.data.current.brand.primaryColor).toBe("#222222");
  });

  it("keeps each channel's versions to itself", async () => {
    const { json } = await dashboard("GET", "/api/channel-design", undefined, other);
    expect(json.data).toMatchObject({ published: null, versions: [] });
  });
});
