import sharp from "sharp";
import { sniffImageType } from "@/lib/image-dimensions";

export const IMAGE_FOLDERS = ["products", "landing", "branding"] as const;
export type ImageFolder = (typeof IMAGE_FOLDERS)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 2400;
const QUALITY = 85;
const MAX_INPUT_PIXELS = 50_000_000;
const VARIANT_STEP = 40;
const VARIANT_MAX = 2000;

export const IMAGE_KEY = /^(products|landing|branding)\/[A-Za-z0-9][A-Za-z0-9_-]*\.(webp|jpe?g|png|gif)$/;

export type IngestedImage =
  | { ok: true; key: string; body: Uint8Array; width: number; height: number }
  | { ok: false; reason: "too_large" | "not_an_image" | "unreadable" };

export async function ingestImage(bytes: Uint8Array, folder: ImageFolder, hex = crypto.randomUUID().replace(/-/g, "")): Promise<IngestedImage> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, reason: "not_an_image" };
  try {
    const { data, info } = await sharp(bytes, { animated: type === "image/gif" || type === "image/webp", limitInputPixels: MAX_INPUT_PIXELS })
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

export interface VariantSpec {
  width: number | null;
  height: number | null;
  fit: "cover" | "contain" | "inside";
}

function snap(raw: string | undefined): number | null | undefined {
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > VARIANT_MAX) return undefined;
  return Math.min(VARIANT_MAX, Math.ceil(value / VARIANT_STEP) * VARIANT_STEP);
}

export function variantSpec(query: { w?: string; h?: string; fit?: string }): VariantSpec | null | "invalid" {
  const width = snap(query.w);
  const height = snap(query.h);
  if (width === undefined || height === undefined) return "invalid";
  if (width === null && height === null) return null;
  if (query.fit !== undefined && query.fit !== "cover" && query.fit !== "contain") return "invalid";
  const fit = width !== null && height !== null ? ((query.fit as "cover" | "contain" | undefined) ?? "cover") : "inside";
  return { width, height, fit };
}

export function variantKey(key: string, spec: VariantSpec): string {
  return `${key}~${spec.width ?? 0}x${spec.height ?? 0}-${spec.fit}`;
}

export async function renderVariant(original: Uint8Array, spec: VariantSpec): Promise<Uint8Array> {
  const data = await sharp(original, { animated: true, limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: spec.width ?? undefined, height: spec.height ?? undefined, fit: spec.fit, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  return new Uint8Array(data);
}
