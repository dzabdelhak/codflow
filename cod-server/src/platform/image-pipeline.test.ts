import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ingestImage, MAX_UPLOAD_BYTES, renderVariant, VARIANT_WIDTHS, variantKey, variantWidth } from "./image-pipeline";

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

  it("refuses a valid image above 50 megapixels as too large, not unreadable", async () => {
    const huge = new Uint8Array(await sharp({ create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png({ compressionLevel: 9 }).toBuffer());
    expect(huge.byteLength).toBeLessThan(MAX_UPLOAD_BYTES);
    expect(await ingestImage(huge, "products")).toEqual({ ok: false, reason: "too_many_pixels" });
  });
});

describe("resized variants", () => {
  it("come in a short fixed list of widths, the next one up from the request", () => {
    expect(variantWidth(undefined)).toBeNull();
    expect(variantWidth("400")).toBe(400);
    expect(variantWidth("300")).toBe(320);
    expect(variantWidth("1")).toBe(80);
    expect(variantWidth("2000")).toBe(2000);
    expect(variantWidth("2001")).toBe("invalid");
    expect(variantWidth("abc")).toBe("invalid");
    expect(VARIANT_WIDTHS.length).toBeLessThanOrEqual(13);
  });

  it("keep the image's proportions, are never enlarged, and are cached under their own key", async () => {
    const original = await png(800, 600);
    const card = await renderVariant(original, 400);
    expect(await sharp(card).metadata()).toMatchObject({ format: "webp", width: 400, height: 300 });
    expect((await sharp(await renderVariant(original, 2000)).metadata()).width).toBe(800);
    expect(variantKey("products/x.webp", 400)).toBe("products/x.webp~w400");
  });
});
