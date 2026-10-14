import { sniffImageType } from "@/lib/image-dimensions";
import { ingestImage, MAX_INPUT_MEGAPIXELS, MAX_UPLOAD_BYTES } from "@/platform/image-pipeline";
import { downloadPublic } from "@/platform/safe-download";
import type { ImageStore } from "@/platform/image-store";

export const MAX_IMAGE_BYTES = MAX_UPLOAD_BYTES;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"] as const;

export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

/** Canonicalize the "image/jpg" alias so it compares equal to "image/jpeg". */
export function canonicalImageContentType(contentType: string): string {
  return contentType === "image/jpg" ? "image/jpeg" : contentType;
}

/** Base64 input cap: MAX_IMAGE_BYTES decoded, plus slack for padding and whitespace. */
export const BASE64_MAX_INPUT_LENGTH = Math.ceil((MAX_IMAGE_BYTES / 3) * 4) + 1024;

/**
 * Decode agent-supplied base64 image bytes. Tolerates a `data:<mime>;base64,`
 * prefix and embedded whitespace — models send both. Throws on invalid base64.
 */
export function decodeBase64Image(input: string): Uint8Array {
  const normalized = input.replace(/^data:[^,]*;base64,/, "").replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

const MB = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));

const DOWNLOAD_ERRORS: Record<string, string> = {
  blocked: "The image URL must point to a public internet address.",
  unreachable: "The image URL could not be fetched.",
  too_large: `Image exceeds the ${MB} MB cap.`,
  too_many_redirects: "The image URL redirects too many times.",
  bad_url: "The image URL must be an http(s) URL.",
};

export async function downloadImage(url: string, download: typeof downloadPublic = downloadPublic): Promise<Outcome<Uint8Array>> {
  const result = await download(url, { capBytes: MAX_IMAGE_BYTES });
  if (result.ok) {
    return result.bytes.byteLength === 0 ? { ok: false, error: "Image URL returned an empty body." } : { ok: true, value: result.bytes };
  }
  if (result.reason === "status") {
    return [401, 403, 404].includes(result.status)
      ? {
          ok: false,
          error: `Image URL returned HTTP ${result.status} — the link is not publicly fetchable or has expired. Re-generate the image and provide its direct download URL.`,
        }
      : { ok: false, error: `Image URL fetch failed with HTTP ${result.status}` };
  }
  return { ok: false, error: DOWNLOAD_ERRORS[result.reason] };
}

export interface StoredLandingImage {
  key: string;
  url: string;
  width: number;
  height: number;
}

/** Checks the bytes match the declared type, stores them as WebP under landing/. */
export async function storeLandingImage(
  store: ImageStore,
  imagesBaseUrl: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<Outcome<StoredLandingImage>> {
  const sniffed = sniffImageType(bytes);
  if (!sniffed) return { ok: false, error: "The bytes are not a recognized image (png, jpeg, webp, or gif)." };
  if (sniffed !== canonicalImageContentType(contentType)) {
    return { ok: false, error: `Content mismatch: the image is ${sniffed} but contentType claims ${contentType}.` };
  }
  const image = await ingestImage(bytes, "landing");
  if (!image.ok) {
    const refusals = {
      too_large: `Image exceeds the ${MB} MB cap.`,
      too_many_pixels: `Image too large: at most ${MAX_INPUT_MEGAPIXELS} megapixels.`,
      not_an_image: "The bytes are not a recognized image (png, jpeg, webp, or gif).",
      unreadable: "The image could not be read.",
    };
    return { ok: false, error: refusals[image.reason] };
  }
  await store.put(image.key, image.body, "image/webp");
  return { ok: true, value: { key: image.key, url: `${imagesBaseUrl}/${image.key}`, width: image.width, height: image.height } };
}
