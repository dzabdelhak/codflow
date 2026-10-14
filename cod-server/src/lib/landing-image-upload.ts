/**
 * Landing page images sent by MCP agents: download or decode, check, then the
 * same pipeline as a dashboard upload (src/platform/image-pipeline.ts).
 */
import { sniffImageType } from "@/lib/image-dimensions";
import { ingestImage, MAX_UPLOAD_BYTES } from "@/platform/image-pipeline";
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

async function readBodyWithCap(response: Response, capBytes: number): Promise<Uint8Array | null> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > capBytes ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > capBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function downloadImage(url: string, fetcher: typeof fetch = fetch): Promise<Outcome<Uint8Array>> {
  let response: Response;
  try {
    response = await fetcher(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    return { ok: false, error: `The image URL could not be fetched: ${(err as Error).message}` };
  }
  if ([401, 403, 404].includes(response.status)) {
    return {
      ok: false,
      error: `Image URL returned HTTP ${response.status} — the link is not publicly fetchable or has expired. Re-generate the image and provide its direct download URL.`,
    };
  }
  if (!response.ok) return { ok: false, error: `Image URL fetch failed with HTTP ${response.status}` };
  if (Number(response.headers.get("content-length") ?? "0") > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image exceeds the ${MB} MB cap.` };
  }
  const bytes = await readBodyWithCap(response, MAX_IMAGE_BYTES);
  if (!bytes) return { ok: false, error: `Image exceeds the ${MB} MB cap.` };
  if (bytes.byteLength === 0) return { ok: false, error: "Image URL returned an empty body." };
  return { ok: true, value: bytes };
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
    return { ok: false, error: image.reason === "too_large" ? `Image exceeds the ${MB} MB cap.` : "The image could not be read." };
  }
  await store.put(image.key, image.body, "image/webp");
  return { ok: true, value: { key: image.key, url: `${imagesBaseUrl}/${image.key}`, width: image.width, height: image.height } };
}
