import sharp from "sharp";
import { sniffImageType } from "@/lib/image-dimensions";

export const IMAGE_FOLDERS = ["products", "landing", "branding"] as const;
export type ImageFolder = (typeof IMAGE_FOLDERS)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_INPUT_MEGAPIXELS = 50;
const MAX_INPUT_PIXELS = MAX_INPUT_MEGAPIXELS * 1_000_000;
const MAX_EDGE = 2400;
const QUALITY = 85;

export const VARIANT_WIDTHS = [80, 160, 240, 320, 400, 480, 640, 720, 800, 960, 1200, 1600, 2000] as const;

export const IMAGE_KEY = /^(products|landing|branding)\/[A-Za-z0-9][A-Za-z0-9_-]*\.(webp|jpe?g|png|gif)$/;

export type IngestRefusal = "too_large" | "too_many_pixels" | "not_an_image" | "unreadable";

export type IngestedImage =
  | { ok: true; key: string; body: Uint8Array; width: number; height: number }
  | { ok: false; reason: IngestRefusal };

export async function ingestImage(bytes: Uint8Array, folder: ImageFolder, hex = crypto.randomUUID().replace(/-/g, "")): Promise<IngestedImage> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, reason: "not_an_image" };
  const animated = type === "image/gif" || type === "image/webp";
  try {
    const { width = 0, height = 0 } = await sharp(bytes, { animated, limitInputPixels: false }).metadata();
    if (width * height > MAX_INPUT_PIXELS) return { ok: false, reason: "too_many_pixels" };
    const { data, info } = await sharp(bytes, { animated, limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      key: `${folder}/${hex}.webp`,
      body: new Uint8Array(data),
      width: info.width,
      height: info.pageHeight ?? info.height,
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

export function variantWidth(requested: string | undefined): number | null | "invalid" {
  if (requested === undefined || requested === "") return null;
  const value = Number(requested);
  if (!Number.isInteger(value) || value < 1 || value > VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]) return "invalid";
  return VARIANT_WIDTHS.find((width) => width >= value)!;
}

export function variantKey(key: string, width: number): string {
  return `${key}~w${width}`;
}

export async function renderVariant(original: Uint8Array, width: number): Promise<Uint8Array> {
  const data = await sharp(original, { animated: true, limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  return new Uint8Array(data);
}
