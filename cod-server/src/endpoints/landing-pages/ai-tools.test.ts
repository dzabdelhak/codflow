/**
 * Landing-pages MCP tools — unit tests for the two-layer validation contract.
 *
 * Proves the Slice-1 hygiene guarantees:
 *   • publishLandingPage never reports success for a nonexistent page (F4)
 *   • publishing an empty stack returns an explicit warning (F4)
 *   • unknown fields are REJECTED, never silently stripped (F5) — the model
 *     gets an actionable error it can recover from
 *   • the STOREFRONT_URL fallback flows from the registry env into every
 *     publicUrl the tools return (F7)
 *
 * And the Slice-3 upload contract:
 *   • uploadLandingPageImage: XOR of imageUrl/imageBase64, magic-byte sniff,
 *     10 MB cap, data-URI tolerance, existence guard, stored as WebP
 *   • getLandingPageImageUploadStatus: complete or unknown
 *
 * The queries module and the cod-shared URL helpers are mocked — these tests
 * cover the tool layer's own logic, not D1 behavior (that lives in the e2e
 * suites). Sniffing, minting, and base64 decoding run for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const landingQueries = vi.hoisted(() => ({
  listLandingPages: vi.fn(),
  getLandingPageById: vi.fn(),
  getLandingPageStats: vi.fn(),
  createLandingPage: vi.fn(),
  updateLandingPage: vi.fn(),
  publishLandingPage: vi.fn(),
  unpublishLandingPage: vi.fn(),
  archiveLandingPage: vi.fn(),
  duplicateLandingPage: vi.fn(),
  deleteLandingPageWithGuard: vi.fn(),
  getLandingPageImage: vi.fn(),
  getLandingPageImages: vi.fn(),
  deleteLandingPageImage: vi.fn(),
  countOtherLandingPageImageReferences: vi.fn(),
  reorderLandingPageImagesChecked: vi.fn(),
  addLandingPageImage: vi.fn(),
  findLandingPageImage: vi.fn(),
}));

vi.mock("./queries", () => landingQueries);

const safeDownload = vi.hoisted(() => ({ downloadPublic: vi.fn() }));
vi.mock("@/platform/safe-download", () => safeDownload);

const sharedLandingQueries = vi.hoisted(() => ({
  resolveStorefrontBaseUrl: vi.fn(),
  buildLandingPagePublicUrl: vi.fn(
    (baseUrl: string | null, slug: string) => (baseUrl ? `${baseUrl}/lp/${slug}` : `/lp/${slug}`),
  ),
}));

vi.mock("../../../../cod-shared/queries/landing-pages", () => sharedLandingQueries);
vi.mock("../../../../cod-shared/queries/channel-products", () => ({ ensureInChannel: vi.fn(async () => {}) }));

import {
  getLandingPageTools,
  LANDING_PAGE_TOOL_OUTPUT_SCHEMAS,
} from "./ai-tools";
import { memoryImageStore } from "@/platform/image-store";

const db = {} as never;
const ENV = { STOREFRONT_URL: "https://fallback.example.com" };
/** Valid RFC 9562 v4 UUID — zod 4's uuid() enforces version + variant nibbles. */
const UUID = "6f0c9b8e-3d2a-4e5f-8a7b-9c1d2e3f4a5b";

type Executable = { execute?: (args: unknown, options: unknown) => Promise<unknown> };

const SESSION = { userId: "user-1", role: "staff" as const, name: "Ada", email: "ada@example.com" };

async function call(
  toolName: string,
  args: unknown,
  env: Record<string, unknown> = ENV,
  session: unknown = SESSION,
): Promise<Record<string, unknown>> {
  const bundle = getLandingPageTools(
    db,
    env as never,
    session as never,
  ) as unknown as Record<string, Executable>;
  const t = bundle[toolName];
  if (!t?.execute) throw new Error(`tool ${toolName} has no execute`);
  return (await t.execute(args, { toolCallId: "test" })) as Record<string, unknown>;
}

const lpWithImages = {
  id: UUID,
  slug: "lp-abc12345",
  name: "Test page",
  status: "draft",
  productId: "prod-1",
  imageGap: 0,
  views: 0,
  publishedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  images: [
    {
      id: "img-1",
      landingPageId: UUID,
      r2Key: "landing/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
      src: "https://media.example.com/landing/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
      altText: null,
      source: "upload",
      position: 1,
      width: 1080,
      height: 1350,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "img-2",
      landingPageId: UUID,
      r2Key: "landing/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png",
      src: "https://media.example.com/landing/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png",
      altText: null,
      source: "ai",
      position: 2,
      width: null,
      height: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  product: null,
  stats: { views: 0, orders: 0, revenue: 0 },
};

const lpEmptyStack = { ...lpWithImages, images: [] };

describe("publishLandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedLandingQueries.resolveStorefrontBaseUrl.mockResolvedValue("https://fallback.example.com");
  });

  it("returns failure for a nonexistent landing page and never publishes (F4)", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(null);

    const res = await call("publishLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(false);
    expect(res.error).toContain("not found");
    expect(landingQueries.publishLandingPage).not.toHaveBeenCalled();
  });

  it("publishes but warns when the image stack is empty, with the fallback URL (F4 + F7)", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(lpEmptyStack);

    const res = await call("publishLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(true);
    expect(res.warning).toEqual(expect.stringContaining("EMPTY image stack"));
    expect(res.publicUrl).toBe("https://fallback.example.com/lp/lp-abc12345");
    expect(sharedLandingQueries.resolveStorefrontBaseUrl).toHaveBeenCalledWith(
      db,
      "https://fallback.example.com",
    );
  });

  it("publishes without a warning when the stack has images", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(lpWithImages);

    const res = await call("publishLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(true);
    expect(res.warning).toBeUndefined();
  });

  it("rejects unknown fields", async () => {
    const res = await call("publishLandingPage", { landingPageId: UUID, force: true });

    expect(res.success).toBe(false);
    expect(res.error).toContain("force");
    expect(landingQueries.getLandingPageById).not.toHaveBeenCalled();
  });
});

describe("createLandingPage — strict layer-2 (F5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedLandingQueries.resolveStorefrontBaseUrl.mockResolvedValue("https://fallback.example.com");
  });

  it("rejects an `images` field instead of silently stripping it", async () => {
    const res = await call("createLandingPage", {
      name: "My page",
      productId: UUID,
      images: [{ src: "https://x/y.png" }],
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("images");
    expect(landingQueries.createLandingPage).not.toHaveBeenCalled();
  });

  it("rejects a hallucinated `status` field", async () => {
    const res = await call("createLandingPage", {
      name: "My page",
      productId: UUID,
      status: "published",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("status");
    expect(landingQueries.createLandingPage).not.toHaveBeenCalled();
  });

  it("creates a valid draft and returns the fallback publicUrl", async () => {
    landingQueries.createLandingPage.mockResolvedValue({ id: UUID, slug: "lp-abc12345" });
    landingQueries.getLandingPageById.mockResolvedValue(lpWithImages);

    const res = await call("createLandingPage", { name: "My page", productId: UUID });

    expect(res.success).toBe(true);
    expect(res.publicUrl).toBe("https://fallback.example.com/lp/lp-abc12345");
    expect(sharedLandingQueries.resolveStorefrontBaseUrl).toHaveBeenCalledWith(
      db,
      "https://fallback.example.com",
    );
  });
});

describe("updateLandingPage — strict layer-2 (F5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unknown field inside updates", async () => {
    const res = await call("updateLandingPage", {
      landingPageId: UUID,
      updates: { imageGap: 10, images: ["a"] },
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("images");
    expect(landingQueries.updateLandingPage).not.toHaveBeenCalled();
  });

  it("applies a valid partial update", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(lpWithImages);

    const res = await call("updateLandingPage", {
      landingPageId: UUID,
      updates: { imageGap: 10 },
    });

    expect(res.success).toBe(true);
    expect(landingQueries.updateLandingPage).toHaveBeenCalledWith(db, UUID, { imageGap: 10 });
  });
});

describe("listLandingPages — strict layer-2 + pagination (F5, Slice 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedLandingQueries.resolveStorefrontBaseUrl.mockResolvedValue(null);
  });

  it("rejects unknown filter fields", async () => {
    const res = await call("listLandingPages", { productId: UUID, sortBy: "views" });

    expect(res.success).toBe(false);
    expect(res.error).toContain("sortBy");
  });

  it("rejects an out-of-range limit", async () => {
    const res = await call("listLandingPages", { limit: 500 });

    expect(res.success).toBe(false);
    expect(res.error).toContain("limit");
    expect(landingQueries.listLandingPages).not.toHaveBeenCalled();
  });

  it("defaults to limit 50, offset 0 — the LLM context stays bounded", async () => {
    landingQueries.listLandingPages.mockResolvedValue([]);

    const res = await call("listLandingPages", {});

    expect(res.success).toBe(true);
    expect(res.count).toBe(0);
    expect(landingQueries.listLandingPages).toHaveBeenCalledWith(db, {}, { limit: 50, offset: 0 });
    expect(sharedLandingQueries.resolveStorefrontBaseUrl).toHaveBeenCalledWith(
      db,
      "https://fallback.example.com",
    );
  });

  it("passes explicit paging through to the query layer", async () => {
    landingQueries.listLandingPages.mockResolvedValue([]);

    await call("listLandingPages", { limit: 20, offset: 40, status: "published" });

    expect(landingQueries.listLandingPages).toHaveBeenCalledWith(
      db,
      { status: "published" },
      { limit: 20, offset: 40 },
    );
  });
});

describe("deleteLandingPage — strict layer-2 (F5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unknown fields", async () => {
    const res = await call("deleteLandingPage", { landingPageId: UUID, force: true });

    expect(res.success).toBe(false);
    expect(res.error).toContain("force");
    expect(landingQueries.getLandingPageStats).not.toHaveBeenCalled();
  });
});

/** Real 1x1 px PNG — the sniff/decode path runs against real bytes. */
const PNG_1x1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const KEY_HEX = "a".repeat(32);
const R2_KEY = `landing/${KEY_HEX}.png`;

const LANDING_PAGE = {
  id: UUID,
  slug: "lp-abc12345",
  name: "Zinc page",
  status: "draft",
  images: [],
  product: null,
  stats: { views: 0, orders: 0, revenue: 0 },
};

function makeUploadEnv() {
  const store = memoryImageStore();
  const env = {
    STOREFRONT_URL: "https://fallback.example.com",
    IMAGES_PUBLIC_URL: "https://api.example.com/images",
    IMAGE_STORE: store,
  };
  return { env, store };
}

function stackFor(row: Record<string, unknown>) {
  return [{ id: "img-9", landingPageId: UUID, position: 1, altText: null, ...row }];
}

function pngDownload() {
  return { ok: true, bytes: new Uint8Array(Buffer.from(PNG_1x1_BASE64, "base64")) };
}

describe("uploadLandingPageImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    safeDownload.downloadPublic.mockResolvedValue(pngDownload());
    landingQueries.getLandingPageById.mockResolvedValue(LANDING_PAGE);
    landingQueries.addLandingPageImage.mockImplementation(async (_db: unknown, _id: string, image: Record<string, unknown>) =>
      stackFor(image),
    );
  });

  it("downloads a URL, stores it as WebP and adds it to the stack before returning", async () => {
    const { env, store } = makeUploadEnv();

    const res = await call(
      "uploadLandingPageImage",
      { landingPageId: UUID, imageUrl: "https://images.openai.example/gen.png", contentType: "image/png", altText: "Hero" },
      env,
    );

    expect(res).toMatchObject({ success: true, status: "complete", uploadJobId: "img-9" });
    const image = res.image as Record<string, unknown>;
    expect(image.r2Key).toMatch(/^landing\/[a-f0-9]{32}\.webp$/);
    expect(image.src).toBe(`https://api.example.com/images/${image.r2Key}`);
    expect(store.objects.get(image.r2Key as string)?.contentType).toBe("image/webp");
    expect(safeDownload.downloadPublic).toHaveBeenCalledWith("https://images.openai.example/gen.png", expect.anything());
    expect(landingQueries.addLandingPageImage).toHaveBeenCalledWith(
      db,
      UUID,
      expect.objectContaining({ altText: "Hero", width: 1, height: 1, source: "ai" }),
    );
  });

  it("stores base64 bytes, tolerating a data-URI prefix and whitespace", async () => {
    const { env, store } = makeUploadEnv();
    const dataUri = `data:image/png;base64,\n${PNG_1x1_BASE64.slice(0, 20)}\n${PNG_1x1_BASE64.slice(20)}`;

    const res = await call("uploadLandingPageImage", { landingPageId: UUID, imageBase64: dataUri, contentType: "image/png" }, env);

    expect(res.success).toBe(true);
    expect(store.objects.size).toBe(1);
  });

  it("uses the download_url of a chat client's file object", async () => {
    const { env } = makeUploadEnv();

    const res = await call(
      "uploadLandingPageImage",
      {
        landingPageId: UUID,
        image: { download_url: "https://files.oaiusercontent.example/abc", file_id: "file-1" },
        contentType: "image/png",
      },
      env,
    );

    expect(res.success).toBe(true);
    expect(safeDownload.downloadPublic).toHaveBeenCalledWith("https://files.oaiusercontent.example/abc", expect.anything());
  });

  it("requires exactly one image source", async () => {
    const { env } = makeUploadEnv();
    const both = await call(
      "uploadLandingPageImage",
      { landingPageId: UUID, imageUrl: "https://x/y.png", imageBase64: PNG_1x1_BASE64, contentType: "image/png" },
      env,
    );
    const neither = await call("uploadLandingPageImage", { landingPageId: UUID, contentType: "image/png" }, env);
    expect(both.error).toContain("exactly one");
    expect(neither.error).toContain("exactly one");
  });

  it("explains an unreachable or expired link", async () => {
    safeDownload.downloadPublic.mockResolvedValue({ ok: false, reason: "status", status: 403 });
    const { env, store } = makeUploadEnv();
    const res = await call("uploadLandingPageImage", { landingPageId: UUID, imageUrl: "https://x/y.png", contentType: "image/png" }, env);
    expect(res.success).toBe(false);
    expect(res.error).toContain("not publicly fetchable");
    expect(store.objects.size).toBe(0);
  });

  it("refuses a URL that points into the private network, without saying what answered", async () => {
    safeDownload.downloadPublic.mockResolvedValue({ ok: false, reason: "blocked" });
    const { env, store } = makeUploadEnv();
    const res = await call("uploadLandingPageImage", { landingPageId: UUID, imageUrl: "http://objects:8333/x.png", contentType: "image/png" }, env);
    expect(res).toMatchObject({ success: false, error: "The image URL must point to a public internet address." });
    expect(store.objects.size).toBe(0);
  });

  it("refuses to store an image whose public address cannot be built", async () => {
    const res = await call(
      "uploadLandingPageImage",
      { landingPageId: UUID, imageBase64: PNG_1x1_BASE64, contentType: "image/png" },
      { STOREFRONT_URL: "https://fallback.example.com", IMAGE_STORE: memoryImageStore() },
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("IMAGES_PUBLIC_URL");
    expect(landingQueries.addLandingPageImage).not.toHaveBeenCalled();
  });

  it("refuses bytes that do not match the declared type, invalid base64 and oversized payloads, storing nothing", async () => {
    const { env, store } = makeUploadEnv();
    const mismatch = await call("uploadLandingPageImage", { landingPageId: UUID, imageBase64: PNG_1x1_BASE64, contentType: "image/jpeg" }, env);
    const invalid = await call("uploadLandingPageImage", { landingPageId: UUID, imageBase64: "%%%not-base64%%%", contentType: "image/png" }, env);
    const big = Buffer.alloc(11 * 1024 * 1024).toString("base64");
    const oversized = await call("uploadLandingPageImage", { landingPageId: UUID, imageBase64: big, contentType: "image/png" }, env);
    expect(mismatch.error).toContain("Content mismatch");
    expect(invalid.success).toBe(false);
    expect(oversized.success).toBe(false);
    expect(store.objects.size).toBe(0);
    expect(landingQueries.addLandingPageImage).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) URLs and disallowed content types", async () => {
    const { env } = makeUploadEnv();
    const ftp = await call("uploadLandingPageImage", { landingPageId: UUID, imageUrl: "ftp://x/y.png", contentType: "image/png" }, env);
    const svg = await call("uploadLandingPageImage", { landingPageId: UUID, imageBase64: PNG_1x1_BASE64, contentType: "image/svg+xml" }, env);
    expect([ftp.success, svg.success]).toEqual([false, false]);
  });

  it("refuses a nonexistent landing page, a missing store and a missing session", async () => {
    const { env } = makeUploadEnv();
    landingQueries.getLandingPageById.mockResolvedValueOnce(null);
    const missingPage = await call("uploadLandingPageImage", { landingPageId: UUID, imageBase64: PNG_1x1_BASE64, contentType: "image/png" }, env);
    const noStore = await call(
      "uploadLandingPageImage",
      { landingPageId: UUID, imageBase64: PNG_1x1_BASE64, contentType: "image/png" },
      { STOREFRONT_URL: "https://fallback.example.com" },
    );
    const noSession = await call(
      "uploadLandingPageImage",
      { landingPageId: UUID, imageBase64: PNG_1x1_BASE64, contentType: "image/png" },
      env,
      null,
    );
    expect(missingPage.error).toContain("not found");
    expect(noStore.error).toContain("not available");
    expect(noSession.error).toContain("session");
  });
});

describe("getLandingPageImageUploadStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports an uploaded image as complete", async () => {
    landingQueries.findLandingPageImage.mockResolvedValue({ id: "img-9", r2Key: R2_KEY, src: "https://x", position: 1, width: 1, height: 1, altText: null });
    const res = await call("getLandingPageImageUploadStatus", { uploadJobId: "img-9-abc" });
    expect(res).toMatchObject({ success: true, status: "complete", image: { imageId: "img-9" } });
  });

  it("reports an unknown ID with recovery advice", async () => {
    landingQueries.findLandingPageImage.mockResolvedValue(undefined);
    const res = await call("getLandingPageImageUploadStatus", { uploadJobId: "lpimg-abc" });
    expect(res).toMatchObject({ success: true, status: "unknown" });
    expect(res.advice).toContain("getLandingPageDetails");
  });

  it("rejects unknown fields", async () => {
    const res = await call("getLandingPageImageUploadStatus", { uploadJobId: "lpimg-abc", verbose: true });
    expect(res.success).toBe(false);
  });
});

describe("removeLandingPageImage", () => {
  const IMG_UUID = "7d1e0c9a-4b3f-4c6d-9e8a-1f2a3b4c5d6e";
  const imageRow = { id: IMG_UUID, landingPageId: UUID, r2Key: R2_KEY, position: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the stored object on the last reference, then the row, and returns the stack", async () => {
    landingQueries.getLandingPageImage.mockResolvedValue(imageRow);
    landingQueries.countOtherLandingPageImageReferences.mockResolvedValue(0);
    landingQueries.deleteLandingPageImage.mockResolvedValue(undefined);
    landingQueries.getLandingPageImages.mockResolvedValue([]);

    const store = memoryImageStore();
    const del = vi.spyOn(store, "delete");
    const env = { STOREFRONT_URL: "https://fallback.example.com", IMAGE_STORE: store };

    const res = await call(
      "removeLandingPageImage",
      { landingPageId: UUID, imageId: IMG_UUID },
      env,
    );

    expect(res.success).toBe(true);
    expect(res.images).toEqual([]);
    expect(res.count).toBe(0);
    expect(del).toHaveBeenCalledWith([R2_KEY]);
    expect(landingQueries.deleteLandingPageImage).toHaveBeenCalledWith(db, UUID, IMG_UUID);
  });

  it("keeps the shared stored object when another page still references it", async () => {
    landingQueries.getLandingPageImage.mockResolvedValue(imageRow);
    landingQueries.countOtherLandingPageImageReferences.mockResolvedValue(2);
    landingQueries.deleteLandingPageImage.mockResolvedValue(undefined);
    landingQueries.getLandingPageImages.mockResolvedValue([]);

    const store = memoryImageStore();
    const del = vi.spyOn(store, "delete");
    const env = { STOREFRONT_URL: "https://fallback.example.com", IMAGE_STORE: store };

    const res = await call(
      "removeLandingPageImage",
      { landingPageId: UUID, imageId: IMG_UUID },
      env,
    );

    expect(res.success).toBe(true);
    expect(del).not.toHaveBeenCalled();
    expect(landingQueries.deleteLandingPageImage).toHaveBeenCalled();
  });

  it("aborts before the DB delete when the storage delete fails", async () => {
    landingQueries.getLandingPageImage.mockResolvedValue(imageRow);
    landingQueries.countOtherLandingPageImageReferences.mockResolvedValue(0);

    const store = memoryImageStore();
    vi.spyOn(store, "delete").mockRejectedValue(new Error("storage is down"));
    const env = { STOREFRONT_URL: "https://fallback.example.com", IMAGE_STORE: store };

    const res = await call(
      "removeLandingPageImage",
      { landingPageId: UUID, imageId: IMG_UUID },
      env,
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain("storage");
    expect(landingQueries.deleteLandingPageImage).not.toHaveBeenCalled();
  });

  it("fails for an image that does not exist on that landing page", async () => {
    landingQueries.getLandingPageImage.mockResolvedValue(null);

    const res = await call("removeLandingPageImage", { landingPageId: UUID, imageId: IMG_UUID }, {
      STOREFRONT_URL: "https://fallback.example.com",
      IMAGE_STORE: memoryImageStore(),
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("not found");
  });

  it("rejects unknown fields", async () => {
    const res = await call(
      "removeLandingPageImage",
      { landingPageId: UUID, imageId: IMG_UUID, force: true },
      { STOREFRONT_URL: "https://fallback.example.com" },
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain("force");
  });
});

describe("reorderLandingPageImages", () => {
  const ID_A = "8a2f1d3b-5c4e-4f60-8b7c-9d0e1f2a3b4c";
  const ID_B = "9b3a2e4c-6d5f-4a71-9c8d-0e1f2a3b4c5d";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies the complete ordered set and returns the new stack", async () => {
    const ordered = [
      { id: ID_B, position: 1 },
      { id: ID_A, position: 2 },
    ];
    landingQueries.reorderLandingPageImagesChecked.mockResolvedValue(ordered);

    const res = await call("reorderLandingPageImages", {
      landingPageId: UUID,
      imageIds: [ID_B, ID_A],
    });

    expect(res.success).toBe(true);
    expect(res.images).toEqual(ordered);
    expect(landingQueries.reorderLandingPageImagesChecked).toHaveBeenCalledWith(db, UUID, [
      ID_B,
      ID_A,
    ]);
  });

  it("surfaces the checked wrapper's validation failures", async () => {
    landingQueries.reorderLandingPageImagesChecked.mockRejectedValue(
      new Error("imageIds must not contain duplicates"),
    );

    const res = await call("reorderLandingPageImages", {
      landingPageId: UUID,
      imageIds: [ID_A, ID_A],
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("duplicates");
  });

  it("rejects an empty imageIds array at the schema layer", async () => {
    const res = await call("reorderLandingPageImages", { landingPageId: UUID, imageIds: [] });

    expect(res.success).toBe(false);
    expect(landingQueries.reorderLandingPageImagesChecked).not.toHaveBeenCalled();
  });
});

describe("duplicateLandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedLandingQueries.resolveStorefrontBaseUrl.mockResolvedValue("https://fallback.example.com");
  });

  it("returns the fresh draft with its new slug and link", async () => {
    landingQueries.duplicateLandingPage.mockResolvedValue("new-id-1");
    landingQueries.getLandingPageById.mockResolvedValue({ ...lpWithImages, id: "new-id-1", slug: "lp-copy0001" });

    const res = await call("duplicateLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(true);
    expect(res.publicUrl).toBe("https://fallback.example.com/lp/lp-copy0001");
    expect(res.note).toContain("zero");
  });

  it("fails for a nonexistent landing page", async () => {
    landingQueries.duplicateLandingPage.mockResolvedValue(null);

    const res = await call("duplicateLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(false);
    expect(res.error).toContain("not found");
  });
});

describe("unpublishLandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedLandingQueries.resolveStorefrontBaseUrl.mockResolvedValue("https://fallback.example.com");
  });

  it("returns the page to draft and reports the (now dead) link", async () => {
    landingQueries.getLandingPageById.mockResolvedValue({ ...lpWithImages, status: "published" });
    landingQueries.unpublishLandingPage.mockResolvedValue(undefined);

    const res = await call("unpublishLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(true);
    expect(landingQueries.unpublishLandingPage).toHaveBeenCalledWith(db, UUID);
    expect(res.publicUrl).toBe("https://fallback.example.com/lp/lp-abc12345");
  });

  it("fails for a nonexistent landing page and never unpublishes", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(null);

    const res = await call("unpublishLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(false);
    expect(res.error).toContain("not found");
    expect(landingQueries.unpublishLandingPage).not.toHaveBeenCalled();
  });
});

describe("archiveLandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("archives and returns the page state with history preserved", async () => {
    landingQueries.getLandingPageById.mockResolvedValue({ ...lpWithImages, status: "published" });
    landingQueries.archiveLandingPage.mockResolvedValue(undefined);

    const res = await call("archiveLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(true);
    expect(res.message).toContain("preserved");
    expect(landingQueries.archiveLandingPage).toHaveBeenCalledWith(db, UUID);
  });

  it("fails for a nonexistent landing page and never archives", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(null);

    const res = await call("archiveLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(false);
    expect(res.error).toContain("not found");
    expect(landingQueries.archiveLandingPage).not.toHaveBeenCalled();
  });

  it("rejects unknown fields", async () => {
    const res = await call("archiveLandingPage", { landingPageId: UUID, keepStats: true });

    expect(res.success).toBe(false);
    expect(res.error).toContain("keepStats");
  });
});

describe("output schemas match what the tools actually return (structuredContent contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedLandingQueries.resolveStorefrontBaseUrl.mockResolvedValue("https://fallback.example.com");
  });

  it("listLandingPages result validates against its output schema", async () => {
    landingQueries.listLandingPages.mockResolvedValue([
      {
        id: UUID,
        slug: "lp-abc12345",
        name: "Zinc page",
        status: "published",
        productId: "p1",
        productName: "Zinc",
        productHandle: "zinc",
        imageCount: 3,
        views: 10,
        orders: 2,
        revenue: 9000,
        publishedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const res = await call("listLandingPages", {});

    expect(LANDING_PAGE_TOOL_OUTPUT_SCHEMAS["listLandingPages"]!.safeParse(res).success).toBe(true);
  });

  it("publishLandingPage empty-stack warning variant validates (warning is declared)", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(lpEmptyStack);

    const res = await call("publishLandingPage", { landingPageId: UUID });

    expect(res.warning).toBeDefined();
    expect(LANDING_PAGE_TOOL_OUTPUT_SCHEMAS["publishLandingPage"]!.safeParse(res).success).toBe(true);
  });

  it("publishLandingPage handled failure validates against the failure envelope", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(null);

    const res = await call("publishLandingPage", { landingPageId: UUID });

    expect(res.success).toBe(false);
    expect(LANDING_PAGE_TOOL_OUTPUT_SCHEMAS["publishLandingPage"]!.safeParse(res).success).toBe(true);
  });

  it("uploadLandingPageImage + status results validate (the ChatGPT pipeline contract)", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(LANDING_PAGE);
    landingQueries.addLandingPageImage.mockImplementation(async (_db: unknown, _id: string, image: Record<string, unknown>) => stackFor(image));
    const { env } = makeUploadEnv();
    const upload = await call("uploadLandingPageImage", { landingPageId: UUID, imageBase64: PNG_1x1_BASE64, contentType: "image/png" }, env);
    expect(upload.success).toBe(true);
    expect(LANDING_PAGE_TOOL_OUTPUT_SCHEMAS["uploadLandingPageImage"]!.safeParse(upload).success).toBe(true);

    landingQueries.findLandingPageImage.mockResolvedValue({ id: "img-9", r2Key: R2_KEY, src: "https://x", position: 1, width: 1080, height: 1350, altText: null });
    const done = await call("getLandingPageImageUploadStatus", { uploadJobId: "img-9-abc" });
    expect(LANDING_PAGE_TOOL_OUTPUT_SCHEMAS["getLandingPageImageUploadStatus"]!.safeParse(done).success).toBe(true);

    landingQueries.findLandingPageImage.mockResolvedValue(undefined);
    const unknown = await call("getLandingPageImageUploadStatus", { uploadJobId: "lpimg-abc" });
    expect(LANDING_PAGE_TOOL_OUTPUT_SCHEMAS["getLandingPageImageUploadStatus"]!.safeParse(unknown).success).toBe(true);
  });

  it("archiveLandingPage and reorderLandingPageImages results validate", async () => {
    landingQueries.getLandingPageById.mockResolvedValue(lpWithImages);
    landingQueries.archiveLandingPage.mockResolvedValue(undefined);
    const archived = await call("archiveLandingPage", { landingPageId: UUID });
    expect(LANDING_PAGE_TOOL_OUTPUT_SCHEMAS["archiveLandingPage"]!.safeParse(archived).success).toBe(true);

    landingQueries.reorderLandingPageImagesChecked.mockResolvedValue([
      { id: "img-1", position: 1, r2Key: R2_KEY, src: "s", altText: null, width: 1, height: 1, source: "ai", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const reordered = await call("reorderLandingPageImages", {
      landingPageId: UUID,
      imageIds: ["8a2f1d3b-5c4e-4f60-8b7c-9d0e1f2a3b4c"],
    });
    expect(LANDING_PAGE_TOOL_OUTPUT_SCHEMAS["reorderLandingPageImages"]!.safeParse(reordered).success).toBe(true);
  });
});
