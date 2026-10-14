import { Context } from "hono";
import type { AppContext } from "@/types";
import { imagesBaseUrl } from "@/platform/image-urls";
import { productImages } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { NotFoundError, ValidationError, SystemError } from "@/lib/errors/classes";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { first } from "../../../../cod-shared/db/client";
import { deleteImage } from "@/platform/image-store";
import {
  IMAGE_FOLDERS,
  IMAGE_KEY,
  ingestImage,
  MAX_UPLOAD_BYTES,
  renderVariant,
  variantKey,
  variantSpec,
  type ImageFolder,
} from "@/platform/image-pipeline";

const UPLOAD_ERRORS = {
  too_large: { message: "File too large. Max 10 MB", code: ERROR_CODES.FILE_TOO_LARGE },
  not_an_image: { message: "This file is not a JPEG, PNG, WebP or GIF image", code: ERROR_CODES.INVALID_FILE_TYPE },
  unreadable: { message: "This image could not be read", code: ERROR_CODES.INVALID_FILE_TYPE },
} as const;

/**
 * POST /api/images/upload
 * Multipart `file` (+ optional `folder`): the bytes must be a real JPEG, PNG,
 * WebP or GIF of at most 10 MB; they are stored as WebP.
 */
export async function uploadImage(c: Context<AppContext>) {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    throw new ValidationError("Expected multipart/form-data", ERROR_CODES.VALIDATION_FAILED);
  }

  const file = formData.get("file") as File | null;
  if (!file || typeof file === "string") {
    throw new ValidationError("Missing file field", ERROR_CODES.REQUIRED_FIELD_MISSING, { field: "file" });
  }
  const folder = (formData.get("folder") ?? "products") as ImageFolder;
  if (!IMAGE_FOLDERS.includes(folder)) {
    throw new ValidationError("Invalid folder", ERROR_CODES.VALIDATION_FAILED, { folder, allowedFolders: IMAGE_FOLDERS });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError(UPLOAD_ERRORS.too_large.message, ERROR_CODES.FILE_TOO_LARGE, {
      fileSize: file.size,
      maxSize: MAX_UPLOAD_BYTES,
      fileName: file.name,
    });
  }

  const image = await ingestImage(new Uint8Array(await file.arrayBuffer()), folder);
  if (!image.ok) {
    const error = UPLOAD_ERRORS[image.reason];
    throw new ValidationError(error.message, error.code, { reason: image.reason, fileName: file.name });
  }

  try {
    await c.env.IMAGE_STORE.put(image.key, image.body, "image/webp");
  } catch (error) {
    throw new SystemError("Failed to upload image to storage", ERROR_CODES.INTERNAL_SERVER_ERROR, {
      key: image.key,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return c.json(
    { success: true, data: { key: image.key, url: `${imagesBaseUrl(c.env, c.req.url)}/${image.key}`, width: image.width, height: image.height } },
    201,
  );
}

const IMAGE_HEADERS = { "Cache-Control": "public, max-age=31536000, immutable" };

/**
 * GET /images/:key{.+}?w=&h=&fit=
 * Public. Without size parameters, the stored image; with them, a WebP
 * variant snapped to a bounded grid, rendered once and kept in storage.
 */
export async function serveImage(c: Context<AppContext>) {
  const key = c.req.param("key") ?? "";
  if (!IMAGE_KEY.test(key)) throw new NotFoundError("Image", key);
  const spec = variantSpec({ w: c.req.query("w"), h: c.req.query("h"), fit: c.req.query("fit") });
  if (spec === "invalid") {
    throw new ValidationError("Invalid image size", ERROR_CODES.VALIDATION_FAILED, { w: c.req.query("w"), h: c.req.query("h") });
  }

  const store = c.env.IMAGE_STORE;
  if (spec === null) {
    const original = await store.get(key);
    if (!original) throw new NotFoundError("Image", key);
    return new Response(original.body, {
      headers: { ...IMAGE_HEADERS, "Content-Type": original.contentType, ...(original.etag ? { ETag: original.etag } : {}) },
    });
  }

  const cacheKey = variantKey(key, spec);
  const cached = await store.get(cacheKey);
  if (cached) return new Response(cached.body, { headers: { ...IMAGE_HEADERS, "Content-Type": "image/webp" } });

  const original = await store.get(key);
  if (!original) throw new NotFoundError("Image", key);
  const body = await renderVariant(original.body, spec);
  c.executionCtx.waitUntil(store.put(cacheKey, body, "image/webp"));
  return new Response(body, { headers: { ...IMAGE_HEADERS, "Content-Type": "image/webp" } });
}

/**
 * GET /api/products/:id/images
 * Returns all images for a product ordered by position.
 */
export async function listProductImages(c: Context<AppContext>) {
  const productId = c.req.param("id")!;
  const db = c.get("db");

  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(productImages.position);

  return c.json({ success: true, data: images }, 200);
}

/**
 * POST /api/products/:id/images
 * Saves an image record after it's been uploaded.
 * Body: { key, src, altText?, position? }
 */
export async function saveProductImage(c: Context<AppContext>) {
  const productId = c.req.param("id")!;
  const db = c.get("db");

  const jsonData: any = (c.req as any).valid?.("json");
  const body = jsonData ?? (await c.req.json<{
    key: string;
    src: string;
    altText?: string;
    position?: number;
    width?: number;
    height?: number;
  }>());

  if (!jsonData && (!body.key || !body.src)) {
    throw new ValidationError(
      "key and src are required",
      ERROR_CODES.REQUIRED_FIELD_MISSING,
      { missingFields: ["key", "src"].filter(f => !body[f as keyof typeof body]) }
    );
  }

  // Get current max position to append at end
  const existing = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId));

  const position =
    body.position ??
    (existing.length > 0
      ? Math.max(...existing.map((i) => i.position)) + 1
      : 1);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const image = {
    id,
    productId,
    src: body.src,
    r2Key: body.key,
    altText: body.altText ?? null,
    width: body.width ?? null,
    height: body.height ?? null,
    srcSm: null,
    srcMd: null,
    srcLg: null,
    type: 1,
    position,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(productImages).values(image);

  return c.json({ success: true, data: image }, 201);
}

/**
 * PATCH /api/products/:id/images/reorder
 * Updates the position of all product images.
 * Body: { imageIds: string[] } — ordered array of all image IDs for the product.
 * Validates: complete set (all product images must be present), no duplicates, all belong to product.
 */
export async function reorderProductImages(c: Context<AppContext>) {
  const productId = c.req.param("id")!;
  const db = c.get("db");

  const jsonData: any = (c.req as any).valid?.("json");
  const body = jsonData ?? (await c.req.json<{ imageIds?: unknown }>());

  if (!Array.isArray(body.imageIds) || body.imageIds.length === 0) {
    throw new ValidationError(
      "imageIds must be a non-empty array of image IDs",
      ERROR_CODES.REQUIRED_FIELD_MISSING,
      { field: "imageIds" }
    );
  }

  const imageIds = body.imageIds as string[];

  if (new Set(imageIds).size !== imageIds.length) {
    throw new ValidationError(
      "imageIds must not contain duplicate IDs",
      ERROR_CODES.VALIDATION_FAILED,
      { field: "imageIds" }
    );
  }

  const existing = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  const existingIds = new Set(existing.map((img) => img.id));

  for (const id of imageIds) {
    if (!existingIds.has(id)) {
      throw new ValidationError(
        `Image ${id} does not belong to product ${productId}`,
        ERROR_CODES.VALIDATION_FAILED,
        { imageId: id, productId }
      );
    }
  }

  if (imageIds.length !== existing.length) {
    throw new ValidationError(
      "imageIds must include all images for this product",
      ERROR_CODES.VALIDATION_FAILED,
      { expected: existing.length, received: imageIds.length }
    );
  }

  for (let position = 1; position <= imageIds.length; position++) {
    await db
      .update(productImages)
      .set({ position })
      .where(eq(productImages.id, imageIds[position - 1]));
  }

  const updated = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.position));

  return c.json({ success: true, data: updated }, 200);
}

/**
 * DELETE /api/products/:id/images/:imageId
 * Deletes the image record and its stored object (with its variants).
 */
export async function deleteProductImage(c: Context<AppContext>) {
  const productId = c.req.param("id")!;
  const imageId = c.req.param("imageId")!;
  const db = c.get("db");
  const image = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
    .then(first);

  if (!image) {
    throw new NotFoundError("Image", imageId);
  }

  // Delete from storage first — a storage failure aborts the whole operation so
  // the DB record never points at a missing object.
  if (image.r2Key) {
    try {
      await deleteImage(c.env.IMAGE_STORE, image.r2Key);
    } catch (error) {
      console.error(`Image delete failed for key: ${image.r2Key}`, error);
      throw new SystemError(
        "Failed to delete image from storage",
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        { imageId, r2Key: image.r2Key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  await db.delete(productImages).where(eq(productImages.id, imageId));

  return c.json({ success: true }, 200);
}
