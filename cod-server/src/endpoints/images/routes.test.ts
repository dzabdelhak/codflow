/**
 * The image routers on the in-memory store: uploads are checked from their
 * bytes and stored as WebP; serving returns the stored image or a resized
 * variant, rendered once and kept.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Hono } from "hono";
import sharp from "sharp";
import type { AppContext } from "@/types";
import { errorHandler } from "@/middleware/error";
import { openApiValidationHook } from "@/openapi/validation-hook";
import { memoryImageStore } from "@/platform/image-store";
import { MAX_UPLOAD_BYTES } from "@/platform/image-pipeline";
import { uploadRouter, serveRouter } from "./routes";

let store: ReturnType<typeof memoryImageStore>;
let pending: Promise<unknown>[];

function apps() {
  const env = { IMAGE_STORE: store, IMAGES_PUBLIC_URL: "https://api.example.com/images" };
  const executionCtx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
  const api = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });
  api.onError(errorHandler);
  api.use("*", async (c, next) => {
    c.set("user", { id: "u1", role: "admin", scopes: ["products:manage"] } as never);
    await next();
  });
  api.route("/api/images", uploadRouter);
  const pub = new Hono<AppContext>();
  pub.onError(errorHandler);
  pub.route("/images", serveRouter);
  return {
    upload: (form: FormData) => api.request("/api/images/upload", { method: "POST", body: form }, env),
    serve: (path: string) => pub.request(path, {}, env, executionCtx as never),
  };
}

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#c82a5a" } }).png().toBuffer());
}

function form(bytes: Uint8Array, name: string, type: string, folder?: string) {
  const data = new FormData();
  data.append("file", new File([bytes], name, { type }));
  if (folder) data.append("folder", folder);
  return data;
}

beforeEach(() => {
  store = memoryImageStore();
  pending = [];
});

describe("POST /api/images/upload", () => {
  it("stores a real image as WebP in its folder and returns its key, address and size", async () => {
    const res = await apps().upload(form(await png(1200, 800), "shoe.png", "image/png", "landing"));
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { key: string; url: string; width: number; height: number } };
    expect(data.key).toMatch(/^landing\/[a-f0-9]{32}\.webp$/);
    expect(data).toMatchObject({ url: `https://api.example.com/images/${data.key}`, width: 1200, height: 800 });
    expect(store.objects.get(data.key)?.contentType).toBe("image/webp");
  });

  it("refuses a file that is not an image even when it claims to be one", async () => {
    const res = await apps().upload(form(new TextEncoder().encode("<html>not an image</html>"), "evil.png", "image/png"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_FILE_TYPE", error: "This file is not a JPEG, PNG, WebP or GIF image" });
    expect(store.objects.size).toBe(0);
  });

  it("refuses an oversized file with a clear message", async () => {
    const res = await apps().upload(form(new Uint8Array(MAX_UPLOAD_BYTES + 1), "big.png", "image/png"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "FILE_TOO_LARGE", error: "File too large. Max 10 MB" });
  });

  it("refuses a request body far above the limit before reading it", async () => {
    const res = await apps().upload(form(new Uint8Array(MAX_UPLOAD_BYTES * 2), "huge.png", "image/png"));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("refuses an unknown folder and a missing file", async () => {
    const folder = await apps().upload(form(await png(10, 10), "a.png", "image/png", "../secrets"));
    const missing = await apps().upload(new FormData());
    expect([folder.status, missing.status]).toEqual([400, 400]);
  });
});

describe("GET /images/{key}", () => {
  async function uploaded(): Promise<string> {
    const res = await apps().upload(form(await png(800, 600), "a.png", "image/png"));
    return ((await res.json()) as { data: { key: string } }).data.key;
  }

  it("serves the stored image with immutable caching", async () => {
    const key = await uploaded();
    const res = await apps().serve(`/images/${key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("resizes on request, snapped to the grid, and keeps the variant for the next request", async () => {
    const key = await uploaded();
    const res = await apps().serve(`/images/${key}?w=300&h=300`);
    expect(res.status).toBe(200);
    expect(await sharp(new Uint8Array(await res.arrayBuffer())).metadata()).toMatchObject({ width: 320, height: 320 });
    await Promise.all(pending);
    expect(store.objects.has(`${key}~320x320-cover`)).toBe(true);
  });

  it("answers 404 for an unknown or malformed key and 400 for an out-of-range size", async () => {
    const key = await uploaded();
    const unknown = await apps().serve(`/images/products/${"f".repeat(32)}.webp`);
    const traversal = await apps().serve("/images/products/..%2F..%2Fetc%2Fpasswd");
    const outOfRange = await apps().serve(`/images/${key}?w=50000`);
    expect([unknown.status, traversal.status, outOfRange.status]).toEqual([404, 404, 400]);
  });
});
