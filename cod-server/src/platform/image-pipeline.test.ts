import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ingestImage, MAX_UPLOAD_BYTES, renderVariant, variantKey, variantSpec } from "./image-pipeline";

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } } }).png().toBuffer(),
  );
}

describe("ingesting an upload", () => {
  it("stores a WebP of a real image, capped at 2400 px, under its folder", async () => {
    const result = await ingestImage(await png(3000, 1500), "products", "a".repeat(32));
    expect(result).toMatchObject({ ok: true, key: `products/${"a".repeat(32)}.webp`, width: 2400, height: 1200 });
    if (result.ok) expect((await sharp(result.body).metadata()).format).toBe("webp");
  });

  it("refuses a file that is not an image whatever it claims, an oversized one and a corrupt one", async () => {
    expect(await ingestImage(new TextEncoder().encode("<svg onload=alert(1)>"), "products")).toEqual({ ok: false, reason: "not_an_image" });
    expect(await ingestImage(new Uint8Array(MAX_UPLOAD_BYTES + 1), "products")).toEqual({ ok: false, reason: "too_large" });
    const corrupt = (await png(10, 10)).slice(0, 30);
    expect(await ingestImage(corrupt, "products")).toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("resized variants", () => {
  it("snap requested sizes up to a bounded grid", () => {
    expect(variantSpec({})).toBeNull();
    expect(variantSpec({ w: "400" })).toEqual({ width: 400, height: null, fit: "inside" });
    expect(variantSpec({ w: "300", h: "200" })).toEqual({ width: 320, height: 200, fit: "cover" });
    expect(variantSpec({ w: "200", h: "80", fit: "contain" })).toEqual({ width: 200, height: 80, fit: "contain" });
    expect(variantSpec({ w: "99999" })).toBe("invalid");
    expect(variantSpec({ w: "abc" })).toBe("invalid");
    expect(variantSpec({ w: "80", h: "80", fit: "fill" })).toBe("invalid");
  });

  it("render at the requested size, never enlarged, and are cached under their own key", async () => {
    const original = await png(800, 600);
    const card = await renderVariant(original, { width: 400, height: 400, fit: "cover" });
    expect(await sharp(card).metadata()).toMatchObject({ format: "webp", width: 400, height: 400 });
    const big = await renderVariant(original, { width: 2000, height: null, fit: "inside" });
    expect((await sharp(big).metadata()).width).toBe(800);
    expect(variantKey("products/x.webp", { width: 400, height: 400, fit: "cover" })).toBe("products/x.webp~400x400-cover");
  });
});
