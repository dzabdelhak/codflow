import { tool } from "ai";
import { ensureInChannel } from "../../../../cod-shared/queries/channel-products";
import { z } from "zod";
import * as queries from "./queries";
import { createLandingPageSchema, updateLandingPageSchema } from "./validation";
import { getDb } from "@/db";
import type { Env } from "@/types/env";
import {
  BASE64_MAX_INPUT_LENGTH,
  decodeBase64Image,
  downloadImage,
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  storeLandingImage,
} from "@/lib/landing-image-upload";
import { deleteImage } from "@/platform/image-store";
import { imagesBaseUrl } from "@/platform/image-urls";
import { ACTIONS, logActivity } from "@/lib/activity";
import { toolOutput } from "@/lib/tool-output-schema";
import {
  buildLandingPagePublicUrl,
  resolveStorefrontBaseUrl,
} from "../../../../cod-shared/queries/landing-pages";

/**
 * Layer-2 validation schemas, hoisted to module level and exported so the MCP
 * layer (src/mcp/schemas.ts) can derive tools/list inputSchema from the exact
 * same definitions — the advertised schema and the executed validation cannot
 * drift apart.
 *
 * Every schema is STRICT: an unknown field is an explicit, recoverable
 * validation error — never a silently stripped key.
 */
export const listLandingPagesSchema = z.strictObject({
  productId: z.string().optional().describe("Filter by product UUID"),
  status: z.enum(["draft", "published", "archived"]).optional().describe("Filter by lifecycle status"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe("Page size (1-200, default 50). Rows are newest-first; page through with offset when the result hits the limit."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of rows to skip — pair with limit for paging through large catalogs."),
});
export const getLandingPageDetailsSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page to retrieve"),
});
export const getLandingPageStatsSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page to get stats for"),
});
export const createLandingPageToolSchema = createLandingPageSchema.strict();
export const updateLandingPageToolSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page to update"),
  updates: updateLandingPageSchema.strict(),
});
export const publishLandingPageSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page to publish"),
});
export const deleteLandingPageSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page to delete"),
});

/** ChatGPT file-object input (openai/fileParams contract): the CLIENT fills
 *  this object — download_url + file_id required, mime_type/file_name optional.
 *  The model never touches image bytes. */
const chatgptFileObjectSchema = z.strictObject({
  download_url: z
    .string()
    .min(1)
    .describe("Direct fetchable URL of the image — filled in by the client, not the model"),
  file_id: z
    .string()
    .min(1)
    .describe("Client-side file identifier — filled in by the client, not the model"),
  mime_type: z.string().optional().describe("MIME type of the image, when the client knows it"),
  file_name: z.string().optional().describe("File name, when the client knows it"),
});

export const uploadLandingPageImageSchema = z
  .strictObject({
    landingPageId: z
      .string()
      .uuid()
      .describe("The UUID of the landing page that receives the image"),
    image: chatgptFileObjectSchema
      .optional()
      .describe(
        "PREFERRED from ChatGPT and other chat clients: the conversation image as a file object. " +
          "The client fills download_url automatically — pass the generated image here; do NOT inline image data.",
      ),
    imageUrl: z
      .url({ protocol: /^https?$/, message: "imageUrl must be an http(s) URL" })
      .optional()
      .describe(
        "A directly-fetchable public http(s) URL of the image — e.g. the download URL of an image you generated. " +
          "Login-protected or expired links fail with a 'not publicly fetchable' error; if so, re-generate or re-host the image and retry with a fresh URL.",
      ),
    imageBase64: z
      .string()
      .max(BASE64_MAX_INPUT_LENGTH)
      .optional()
      .describe(
        "Programmatic clients ONLY (API/agent harnesses that construct this call in code). " +
          "NEVER use from a chat client: inline image data is blocked by client safety checks before the call is sent, " +
          "and raw bytes, base64-encoded (max 8 MB decoded), cannot be emitted as tool arguments anyway.",
      ),
    contentType: z
      .enum(IMAGE_CONTENT_TYPES)
      .describe(
        "MIME type of the actual image bytes: image/png, image/jpeg, image/webp, or image/gif. " +
          "ChatGPT image generation outputs PNG. Verified server-side by magic-byte sniffing — a mismatch is rejected.",
      ),
    altText: z.string().max(1000).optional().describe("Alt text for accessibility"),
    position: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Stack position, 1 = top of the page. Omit to append at the end of the stack."),
    width: z
      .number()
      .int()
      .min(1)
      .max(20000)
      .optional()
      .describe(
        "Intrinsic pixel width — only if you know it; the server measures automatically and its measurement wins.",
      ),
    height: z
      .number()
      .int()
      .min(1)
      .max(20000)
      .optional()
      .describe(
        "Intrinsic pixel height — only if you know it; the server measures automatically and its measurement wins.",
      ),
  })
  .refine(
    (data) =>
      [data.image, data.imageUrl, data.imageBase64].filter((v) => v !== undefined).length === 1,
    {
      message:
        "Provide exactly one of image (chat clients — the file object), imageUrl (a public URL), or imageBase64 (programmatic clients only).",
    },
  );

export const getLandingPageImageUploadStatusSchema = z.strictObject({
  uploadJobId: z
    .string()
    .min(6)
    .max(100)
    .describe("The uploadJobId returned by uploadLandingPageImage"),
});

/**
 * ChatGPT tool-descriptor `_meta` extensions for this domain. Merged by
 * src/mcp/schemas.ts into TOOL_META and attached at registration time in
 * server-factory.ts.
 *
 * `openai/fileParams` tells the ChatGPT runtime that the named input is a
 * file object it should construct itself (with a real, fetchable
 * download_url) — the supported way to pass conversation files to a tool,
 * because tool-call arguments are model-generated JSON that can never carry
 * image bytes.
 *
 * `openai/toolInvocation` status text (≤64 chars each) is what ChatGPT shows
 * while the tool runs and after it completes — the async upload is the one
 * flow where that feedback matters most.
 */
export const LANDING_PAGE_TOOL_META: Record<string, Record<string, unknown>> = {
  uploadLandingPageImage: {
    "openai/fileParams": ["image"],
    "openai/toolInvocation/invoking": "Uploading the image…",
    "openai/toolInvocation/invoked": "Image added to the landing page",
  },
};

/** One landing_page_images row — the ordered image stack entry. */
const lpImageRowSchema = z.looseObject({
  id: z.string().describe("Image row UUID — used by removeLandingPageImage and reorderLandingPageImages"),
  r2Key: z.string().describe("R2 storage object key (landing/<hex>.<ext>)"),
  src: z.string().describe("Public image URL on the media domain"),
  altText: z.string().nullable().describe("Alt text, or null"),
  position: z.number().int().describe("Stack position — 1 is the top of the page"),
  width: z.number().int().nullable().describe("Intrinsic pixel width, or null when unmeasured"),
  height: z.number().int().nullable().describe("Intrinsic pixel height, or null when unmeasured"),
  source: z.enum(["upload", "ai"]).describe("Provenance: uploaded by a human or generated by an AI agent"),
});

/** A landing page detail aggregate (the shape getLandingPageById returns). */
const lpDetailSchema = z.looseObject({
  id: z.string().describe("Landing page UUID"),
  slug: z.string().describe("Public slug — the page lives at /lp/<slug>"),
  name: z.string(),
  status: z.enum(["draft", "published", "archived"]).describe("Lifecycle status"),
  productId: z.string().describe("The single product this page markets"),
  imageGap: z.number().int().describe("Gap in pixels between stacked images"),
  views: z.number().int().describe("Render count (non-unique; refreshes and bots included)"),
  images: z.array(lpImageRowSchema).describe("The ordered image stack — index 0 renders at the top of the page"),
  product: z
    .looseObject({
      id: z.string(),
      name: z.string(),
      handle: z.string(),
      price: z.number().describe("Catalog price charged on this page (server-authoritative)"),
    })
    .nullable()
    .describe("The linked product, or null when it was deleted"),
  stats: z.looseObject({
    views: z.number().int(),
    orders: z.number().int().describe("Orders placed and attributed to this page (any status)"),
    revenue: z.number().describe("Gross booked value of attributed orders (any status)"),
  }),
});

const lpListItemSchema = z.looseObject({
  id: z.string().describe("Landing page UUID"),
  slug: z.string().describe("Public slug — the page lives at /lp/<slug>"),
  name: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  productId: z.string(),
  productName: z.string().nullable(),
  imageCount: z.number().int().describe("Images in the stack"),
  views: z.number().int(),
  orders: z.number().int().describe("Orders placed and attributed (any status)"),
  revenue: z.number().describe("Gross booked value (any status)"),
  publicPath: z.string().describe("Relative public path /lp/<slug>"),
  publicUrl: z.string().describe("Absolute public URL when a storefront base resolves, else the relative path"),
});

const lpStatsSchema = z.looseObject({
  views: z.number().int().describe("Render count (non-unique)"),
  orders: z.number().int().describe("Orders placed and attributed (any status, cancelled/returned included)"),
  revenue: z.number().describe("Gross booked value of attributed orders (any status)"),
});

export const LANDING_PAGE_TOOL_OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
  listLandingPages: toolOutput({
    count: z.number().int().describe("Rows returned on this page — page with offset when it equals the limit"),
    landingPages: z.array(lpListItemSchema).describe("Landing pages, newest first"),
  }),
  getLandingPageDetails: toolOutput({
    landingPage: lpDetailSchema.describe("Settings, the ordered image stack, the linked product, and stats"),
  }),
  getLandingPageStats: toolOutput({
    stats: lpStatsSchema,
  }),
  createLandingPage: toolOutput({
    landingPage: lpDetailSchema.describe("The created draft — its image stack is EMPTY until images are added"),
    publicPath: z.string(),
    publicUrl: z.string(),
    note: z.string().describe("Next steps: add images, then publish"),
  }),
  updateLandingPage: toolOutput({
    landingPage: lpDetailSchema,
  }),
  publishLandingPage: toolOutput({
    landingPage: lpDetailSchema.describe("The published page"),
    publicPath: z.string(),
    publicUrl: z.string().describe("The live link the merchant pastes into ad sets"),
    warning: z.string().optional().describe("Present when published with an EMPTY image stack — add images before running ads"),
  }),
  deleteLandingPage: toolOutput({
    message: z.string(),
  }),
  uploadLandingPageImage: toolOutput({
    uploadJobId: z.string().describe("The new image's ID (also accepted by getLandingPageImageUploadStatus)"),
    status: z.literal("complete").describe("The image is stored and in the stack"),
    image: z.looseObject({
      imageId: z.string().describe("The inserted image row's UUID — used by removeLandingPageImage and reorderLandingPageImages"),
      r2Key: z.string(),
      src: z.string().describe("Public image URL"),
      position: z.number().int().nullable().describe("Stack position — 1 is the top of the page"),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
      altText: z.string().nullable(),
    }),
    note: z.string(),
  }),
  getLandingPageImageUploadStatus: toolOutput({
    uploadJobId: z.string(),
    status: z
      .enum(["processing", "complete", "failed", "stopped", "unknown"])
      .describe("processing → keep polling; complete → the image is in the stack; failed → see error; unknown → check the stack directly"),
    image: z
      .looseObject({
        imageId: z.string().describe("The inserted image row's UUID — used by removeLandingPageImage and reorderLandingPageImages"),
        r2Key: z.string(),
        src: z.string().describe("Public image URL"),
        position: z.number().int().nullable().describe("Stack position — 1 is the top of the page"),
        width: z.number().int().nullable(),
        height: z.number().int().nullable(),
        altText: z.string().nullable(),
        converted: z.boolean().optional().describe("True when the stored object is WebP (transcoded, or the source already was)"),
        storedContentType: z.string().optional().describe("Content type of the stored object — image/webp, or the source type when conversion was unavailable"),
      })
      .nullable()
      .optional()
      .describe("On complete: the inserted image (imageId, src, position)"),
    error: z.string().optional().describe("On failed: what went wrong and how to recover"),
    note: z.string().optional(),
    advice: z.string().optional().describe("Next-step guidance"),
  }),
  removeLandingPageImage: toolOutput({
    images: z.array(lpImageRowSchema).describe("The stack after removal"),
    count: z.number().int(),
  }),
  reorderLandingPageImages: toolOutput({
    images: z.array(lpImageRowSchema).describe("The stack in its new order — index 0 is the top of the page"),
    count: z.number().int(),
  }),
  duplicateLandingPage: toolOutput({
    landingPage: lpDetailSchema.describe("The fresh draft copy — views/orders/revenue start at zero"),
    publicPath: z.string(),
    publicUrl: z.string(),
    note: z.string(),
  }),
  unpublishLandingPage: toolOutput({
    landingPage: lpDetailSchema.describe("The page, now back in draft — its link 404s but history stays"),
    publicPath: z.string(),
    publicUrl: z.string(),
  }),
  archiveLandingPage: toolOutput({
    landingPage: lpDetailSchema.describe("The archived page — history preserved, link retired"),
    message: z.string(),
  }),
};

export const removeLandingPageImageSchema = z.strictObject({
  landingPageId: z
    .string()
    .uuid()
    .describe("The UUID of the landing page that owns the image"),
  imageId: z
    .string()
    .uuid()
    .describe(
      "The UUID of the image row to remove — get the current stack and its IDs from getLandingPageDetails",
    ),
});

export const reorderLandingPageImagesSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page"),
  imageIds: z
    .array(z.string().uuid())
    .min(1)
    .describe(
      "The COMPLETE ordered list of ALL image IDs for this landing page — index 0 becomes position 1 (top of the page). " +
        "No duplicates, no omissions: the set must exactly match the current stack from getLandingPageDetails.",
    ),
});

export const duplicateLandingPageSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page to duplicate"),
});

export const unpublishLandingPageSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page to unpublish"),
});

export const archiveLandingPageSchema = z.strictObject({
  landingPageId: z.string().uuid().describe("The UUID of the landing page to archive"),
});

export const LANDING_PAGE_TOOL_SCHEMAS: Record<string, z.ZodRawShape> = {
  listLandingPages: listLandingPagesSchema.shape,
  getLandingPageDetails: getLandingPageDetailsSchema.shape,
  getLandingPageStats: getLandingPageStatsSchema.shape,
  createLandingPage: createLandingPageToolSchema.shape,
  updateLandingPage: updateLandingPageToolSchema.shape,
  publishLandingPage: publishLandingPageSchema.shape,
  deleteLandingPage: deleteLandingPageSchema.shape,
  uploadLandingPageImage: uploadLandingPageImageSchema.shape,
  getLandingPageImageUploadStatus: getLandingPageImageUploadStatusSchema.shape,
  removeLandingPageImage: removeLandingPageImageSchema.shape,
  reorderLandingPageImages: reorderLandingPageImagesSchema.shape,
  duplicateLandingPage: duplicateLandingPageSchema.shape,
  unpublishLandingPage: unpublishLandingPageSchema.shape,
  archiveLandingPage: archiveLandingPageSchema.shape,
};

/** Env surface the landing-page tools consume: deployment vars and image storage. */
export type LandingPageToolEnv = Pick<Env, "STOREFRONT_URL" | "IMAGE_STORE" | "IMAGES_PUBLIC_URL" | "WORKER_SELF_URL">;

/** Verified session identity — structurally satisfied by McpProps. Only the
 *  upload tool needs it (the upload is audited through this actor). */
export interface LandingPageToolSession {
  userId: string;
  role: "admin" | "staff";
  name?: string;
  email?: string;
}

/** Zod issues → one readable line. Empty paths (e.g. unrecognized keys) do not
 *  get a dangling "path: " prefix. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    )
    .join("; ");
}

/**
 * AI Tools for Landing Pages
 *
 * Landing pages are one-product marketing pages: an ordered image stack with
 * the COD order form at the bottom. Merchants create several per product, run
 * ads to each, and compare which converts. The charged price is always the
 * product's catalog price — the price story lives in the images.
 *
 * Two-Layer Validation Pattern:
 * - Layer 1 (LLM-level): Permissive input schema accepts any object to prevent SDK crashes
 * - Layer 2 (App-level): STRICT validation inside execute() with graceful error handling —
 *   unknown fields are rejected with an actionable message so the model can retry
 */
export const getLandingPageTools = (
  db: ReturnType<typeof getDb>,
  env?: LandingPageToolEnv,
  session?: LandingPageToolSession,
) => ({

  listLandingPages: tool({
    description:
      "List landing pages (newest first) with per-page stats: views, attributed orders, and revenue. " +
      "Orders are counted as PLACED regardless of status (cancelled/returned included) — treat revenue as gross booked value, not realized sales. " +
      "Optionally filter by product or lifecycle status (draft | published | archived). " +
      "Returns up to `limit` rows (default 50) — page with offset when the result fills the page. " +
      "Each row includes the public slug — the link the merchant pastes into ad sets is /lp/<slug>.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const validationSchema = listLandingPagesSchema;
        const parsed = validationSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error:
              `Invalid filter arguments: ${formatIssues(parsed.error)}. ` +
              "Expected: productId (UUID, optional), status (draft|published|archived, optional), limit (1-200, default 50), offset (≥ 0). Unknown fields are rejected.",
          };
        }

        const pages = await queries.listLandingPages(
          db,
          {
            ...(parsed.data.productId ? { productId: parsed.data.productId } : {}),
            ...(parsed.data.status ? { status: parsed.data.status } : {}),
          },
          { limit: parsed.data.limit, offset: parsed.data.offset },
        );
        const baseUrl = await resolveStorefrontBaseUrl(db, env?.STOREFRONT_URL);
        return {
          success: true,
          count: pages.length,
          landingPages: pages.map((p) => ({
            id: p.id,
            slug: p.slug,
            name: p.name,
            status: p.status,
            productId: p.productId,
            productName: p.productName,
            imageCount: p.imageCount,
            views: p.views,
            orders: p.orders,
            revenue: p.revenue,
            publicPath: `/lp/${p.slug}`,
            publicUrl: buildLandingPagePublicUrl(baseUrl, p.slug),
          })),
        };
      } catch (error) {
        return { success: false, error: `Failed to list landing pages: ${(error as Error).message}` };
      }
    },
  }),

  getLandingPageDetails: tool({
    description:
      "Get full landing page details by ID: settings, the ordered image stack, the linked product, and stats. " +
      "Use this to inspect a page's creatives and spacing before editing.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = getLandingPageDetailsSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID). Unknown fields are rejected.`,
          };
        }

        const lp = await queries.getLandingPageById(db, parsed.data.landingPageId);
        if (!lp) {
          return { success: false, error: `Landing page ${parsed.data.landingPageId} not found` };
        }
        return { success: true, landingPage: lp };
      } catch (error) {
        return { success: false, error: `Failed to get landing page: ${(error as Error).message}` };
      }
    },
  }),

  getLandingPageStats: tool({
    description:
      "Get a landing page's performance stats: views, attributed orders, and revenue. " +
      "Orders are counted as PLACED regardless of status (cancelled/returned included) — treat revenue as gross booked value, not realized sales. " +
      "Conversion rate = orders / views (compute it yourself; zero views means the rate is undefined).",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = getLandingPageStatsSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID). Unknown fields are rejected.`,
          };
        }

        const stats = await queries.getLandingPageStats(db, parsed.data.landingPageId);
        if (!stats) {
          return { success: false, error: `Landing page ${parsed.data.landingPageId} not found` };
        }
        return { success: true, stats };
      } catch (error) {
        return { success: false, error: `Failed to get stats: ${(error as Error).message}` };
      }
    },
  }),

  createLandingPage: tool({
    description:
      "Create a draft landing page for a product. The slug defaults to lp-<8 chars> and is editable later via updateLandingPage. " +
      "A new page starts with an EMPTY image stack — add images with uploadLandingPageImage before publishing. " +
      "The page charges the product's catalog price — there is no price override; the price story lives in the images.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = createLandingPageToolSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error:
              `Invalid arguments: ${formatIssues(parsed.error)}. ` +
              "Expected: name (2-200 chars), productId (UUID), optional slug ([a-z0-9-]{3,60}), optional imageGap (0-200 px). Unknown fields are rejected — images cannot be set at creation.",
          };
        }

        const { id, slug } = await queries.createLandingPage(db, parsed.data);
        await ensureInChannel(db, parsed.data.productId);
        const lp = await queries.getLandingPageById(db, id);
        const baseUrl = await resolveStorefrontBaseUrl(db, env?.STOREFRONT_URL);
        return {
          success: true,
          landingPage: lp,
          publicPath: `/lp/${slug}`,
          publicUrl: buildLandingPagePublicUrl(baseUrl, slug),
          note: "Draft created with an empty image stack. Add images via uploadLandingPageImage, then publishLandingPage to make the link live.",
        };
      } catch (error) {
        return { success: false, error: `Failed to create landing page: ${(error as Error).message}` };
      }
    },
  }),

  updateLandingPage: tool({
    description:
      "Partially update a landing page's settings: name, slug, image gap (imageGap, pixels 0-200), or SEO meta (metaTitle, metaDescription). " +
      "A taken slug is rejected. The image stack is NOT managed by this tool — use uploadLandingPageImage, removeLandingPageImage, and reorderLandingPageImages instead.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = updateLandingPageToolSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error:
              `Invalid arguments: ${formatIssues(parsed.error)}. ` +
              "Expected: landingPageId (UUID) and updates { name?, slug?, imageGap?, metaTitle?, metaDescription? }. Unknown fields are rejected — the image stack is not updatable here.",
          };
        }

        await queries.updateLandingPage(db, parsed.data.landingPageId, parsed.data.updates);
        const lp = await queries.getLandingPageById(db, parsed.data.landingPageId);
        return { success: true, landingPage: lp };
      } catch (error) {
        return { success: false, error: `Failed to update landing page: ${(error as Error).message}` };
      }
    },
  }),

  publishLandingPage: tool({
    description:
      "Publish a landing page — its link /lp/<slug> goes live and starts counting views. " +
      "The result carries a warning when the page's image stack is empty (the public page would render only the order form). " +
      "unpublishLandingPage returns it to draft later (the link stops resolving but history stays).",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = publishLandingPageSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID). Unknown fields are rejected.`,
          };
        }

        const existing = await queries.getLandingPageById(db, parsed.data.landingPageId);
        if (!existing) {
          return { success: false, error: `Landing page ${parsed.data.landingPageId} not found` };
        }

        await queries.publishLandingPage(db, parsed.data.landingPageId);
        const lp = await queries.getLandingPageById(db, parsed.data.landingPageId);
        const slug = lp?.slug ?? existing.slug;
        const imageCount = lp?.images?.length ?? existing.images?.length ?? 0;
        const baseUrl = await resolveStorefrontBaseUrl(db, env?.STOREFRONT_URL);
        return {
          success: true,
          landingPage: lp,
          publicPath: `/lp/${slug}`,
          publicUrl: buildLandingPagePublicUrl(baseUrl, slug),
          ...(imageCount === 0
            ? {
                warning:
                  "Published with an EMPTY image stack — the public page will render only the order form with no images. " +
                  "Add images via uploadLandingPageImage before pointing ads at this link.",
              }
            : {}),
        };
      } catch (error) {
        return { success: false, error: `Failed to publish: ${(error as Error).message}` };
      }
    },
  }),

  deleteLandingPage: tool({
    description:
      "Permanently delete a landing page with NO attributed orders. " +
      "Refused (LANDING_PAGE_HAS_ORDERS) when any order references the page — archive it instead via archiveLandingPage so attribution history stays intact. " +
      "This action is immediate and irreversible.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = deleteLandingPageSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID). Unknown fields are rejected.`,
          };
        }

        const stats = await queries.getLandingPageStats(db, parsed.data.landingPageId);
        if (!stats) {
          return { success: false, error: `Landing page ${parsed.data.landingPageId} not found` };
        }
        if (stats.orders > 0) {
          return {
            success: false,
            error: `Landing page has ${stats.orders} attributed order(s) — delete is refused. Archive it instead via archiveLandingPage.`,
          };
        }

        await queries.deleteLandingPageWithGuard(db, parsed.data.landingPageId);
        return { success: true, message: "Landing page deleted" };
      } catch (error) {
        return { success: false, error: `Failed to delete landing page: ${(error as Error).message}` };
      }
    },
  }),

  uploadLandingPageImage: tool({
    description:
      "Upload an image into a landing page's image stack (the marketing story — price framing, urgency, benefits — lives in the images). " +
      "The image is downloaded, checked and added to the stack before this returns (status 'complete', with the new image).\n" +
      "Pass the image in EXACTLY ONE of three ways:\n" +
      "• image (file object) — the way ChatGPT and chat clients pass a conversation image: the client fills download_url itself. " +
      "Generate the image first, then pass it here.\n" +
      "• imageUrl — any directly-fetchable public http(s) URL (e.g. a re-hosted image). Login-protected or expired links fail with 'not publicly fetchable' — re-host and retry.\n" +
      "• imageBase64 — programmatic clients only. NEVER from a chat client: inline image data is blocked by client safety checks before the call is sent.\n" +
      "contentType must match the actual bytes (ChatGPT image generation outputs image/png) — verified server-side by magic-byte sniffing. " +
      "Images are STORED as WebP, at most 2400 px on the longest side, 10 MB max input. " +
      "New images append to the end of the stack; set position to place one (1 = top of the page), or reorder the whole stack later with reorderLandingPageImages. " +
      "A failed upload is safe to retry.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = uploadLandingPageImageSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error:
              `Invalid arguments: ${formatIssues(parsed.error)}. ` +
              "Expected: landingPageId (UUID), contentType (image/png|jpeg|webp|gif), and exactly one of image (chat clients — file object), imageUrl (http(s) URL), or imageBase64 (programmatic clients only); " +
              "optional: altText, position, width, height. Unknown fields are rejected.",
          };
        }
        const data = parsed.data;

        if (!env?.IMAGE_STORE) {
          return { success: false, error: "Image upload is not available on this deployment — image storage is not configured." };
        }
        if (!session) {
          return {
            success: false,
            error: "Upload requires a verified session identity — none is attached to this connection.",
          };
        }

        const existing = await queries.getLandingPageById(db, data.landingPageId);
        if (!existing) {
          return { success: false, error: `Landing page ${data.landingPageId} not found` };
        }

        let bytes: Uint8Array;
        let uploadKind: "url" | "bytes";
        const downloadUrl = data.image?.download_url ?? data.imageUrl;
        if (downloadUrl !== undefined) {
          if (!/^https?:\/\//.test(downloadUrl)) {
            return {
              success: false,
              error: "The image file's download_url must be an http(s) URL — cannot fetch it server-side.",
            };
          }
          const downloaded = await downloadImage(downloadUrl);
          if (!downloaded.ok) return { success: false, error: downloaded.error };
          bytes = downloaded.value;
          uploadKind = "url";
        } else {
          const imageBase64 = data.imageBase64;
          if (imageBase64 === undefined) {
            return {
              success: false,
              error:
                "Provide exactly one of image (chat clients — file object), imageUrl (http(s) URL), or imageBase64 (programmatic clients only).",
            };
          }
          try {
            bytes = decodeBase64Image(imageBase64);
          } catch {
            return { success: false, error: "imageBase64 is not valid base64." };
          }
          if (bytes.byteLength === 0) {
            return { success: false, error: "imageBase64 decodes to zero bytes." };
          }
          if (bytes.byteLength > MAX_IMAGE_BYTES) {
            return { success: false, error: `Image exceeds the 10 MB cap (${bytes.byteLength} bytes decoded).` };
          }
          uploadKind = "bytes";
        }

        const baseUrl = imagesBaseUrl(env);
        if (!baseUrl) {
          return { success: false, error: "Image upload is not available on this deployment — IMAGES_PUBLIC_URL is not configured." };
        }
        const stored = await storeLandingImage(env.IMAGE_STORE, baseUrl, bytes, data.contentType);
        if (!stored.ok) return { success: false, error: stored.error };

        const images = await queries.addLandingPageImage(db, data.landingPageId, {
          r2Key: stored.value.key,
          src: stored.value.url,
          altText: data.altText ?? null,
          ...(data.position !== undefined ? { position: data.position } : {}),
          width: stored.value.width,
          height: stored.value.height,
          source: "ai",
        });
        const image = images.find((row) => row.r2Key === stored.value.key);
        if (!image) return { success: false, error: "The image was stored but its row is missing from the stack." };

        await logActivity(
          db,
          { id: session.userId, name: session.name || session.email || session.userId, role: session.role },
          ACTIONS.LANDING_PAGE_UPDATED,
          { type: "landing_page", id: data.landingPageId, label: existing.name },
          { via: "mcp", action: "image_added", source: "ai", imageId: image.id, r2Key: image.r2Key, uploadKind },
        );

        return {
          success: true,
          uploadJobId: image.id,
          status: "complete" as const,
          image: {
            imageId: image.id,
            r2Key: image.r2Key,
            src: image.src,
            position: image.position,
            width: image.width,
            height: image.height,
            altText: image.altText,
          },
          note:
            "The image is in the landing page stack (stored as WebP). Review it with getLandingPageDetails, reorder with reorderLandingPageImages, then publishLandingPage.",
        };
      } catch (error) {
        return { success: false, error: `Failed to upload image: ${(error as Error).message}` };
      }
    },
  }),

  getLandingPageImageUploadStatus: tool({
    description:
      "Look up an image returned by uploadLandingPageImage — pass its uploadJobId. Uploads complete synchronously, so this reports " +
      "'complete' (with the image) or 'unknown' (no such image — check getLandingPageDetails).",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = getLandingPageImageUploadStatusSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: uploadJobId (the ID returned by uploadLandingPageImage). Unknown fields are rejected.`,
          };
        }

        const image = await queries.findLandingPageImage(db, parsed.data.uploadJobId);
        if (!image) {
          return {
            success: true,
            uploadJobId: parsed.data.uploadJobId,
            status: "unknown" as const,
            advice: "No image with this ID. Check getLandingPageDetails to see the current stack before re-uploading.",
          };
        }
        return {
          success: true,
          uploadJobId: parsed.data.uploadJobId,
          status: "complete" as const,
          image: {
            imageId: image.id,
            r2Key: image.r2Key,
            src: image.src,
            position: image.position,
            width: image.width,
            height: image.height,
            altText: image.altText,
          },
          advice: "Uploads complete synchronously: the image is in the landing page stack.",
        };
      } catch (error) {
        return { success: false, error: `Failed to check upload status: ${(error as Error).message}` };
      }
    },
  }),

  removeLandingPageImage: tool({
    description:
      "Remove an image from a landing page's stack — get the current image IDs from getLandingPageDetails. " +
      "Storage note: duplicated pages can share the same underlying image object; the storage object itself is deleted only when this was its LAST referencing image. " +
      "Returns the updated stack. Removing is final for this page — restoring means re-uploading via uploadLandingPageImage.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = removeLandingPageImageSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID) and imageId (UUID). Unknown fields are rejected.`,
          };
        }
        const { landingPageId, imageId } = parsed.data;

        const image = await queries.getLandingPageImage(db, landingPageId, imageId);
        if (!image) {
          return {
            success: false,
            error: `Image ${imageId} not found on landing page ${landingPageId}`,
          };
        }

        // Same contract as the dashboard path: storage delete FIRST — a storage
        // failure aborts so the DB record never points at a missing object;
        // shared objects (duplicates) survive until their last reference goes.
        if (image.r2Key) {
          const otherRefs = await queries.countOtherLandingPageImageReferences(
            db,
            image.r2Key,
            imageId,
          );
          if (otherRefs === 0) {
            if (!env?.IMAGE_STORE) {
              return {
                success: false,
                error: "Image removal is not available — image storage is not configured on this deployment.",
              };
            }
            try {
              await deleteImage(env.IMAGE_STORE, image.r2Key);
            } catch (err) {
              return {
                success: false,
                error: `Failed to delete image from storage: ${(err as Error).message}`,
              };
            }
          }
        }

        await queries.deleteLandingPageImage(db, landingPageId, imageId);
        const images = await queries.getLandingPageImages(db, landingPageId);
        return { success: true, images, count: images.length };
      } catch (error) {
        return { success: false, error: `Failed to remove image: ${(error as Error).message}` };
      }
    },
  }),

  reorderLandingPageImages: tool({
    description:
      "Set the order of a landing page's image stack. Index 1 is the TOP of the page — the first thing shoppers see, so put the strongest creative there. " +
      "Send the COMPLETE ordered array of ALL image IDs (from getLandingPageDetails): every current image exactly once — no duplicates, no omissions. " +
      "Partial or mismatched lists are rejected. Returns the stack in its new order.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = reorderLandingPageImagesSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID) and imageIds (the complete ordered array of all image UUIDs, index 1 = top of the page). Unknown fields are rejected.`,
          };
        }

        const images = await queries.reorderLandingPageImagesChecked(
          db,
          parsed.data.landingPageId,
          parsed.data.imageIds,
        );
        return { success: true, images, count: images.length };
      } catch (error) {
        return { success: false, error: `Failed to reorder images: ${(error as Error).message}` };
      }
    },
  }),

  duplicateLandingPage: tool({
    description:
      "Duplicate a landing page: a fresh DRAFT with a new slug, the same product, spacing, SEO meta, and image stack (copies share the original storage objects). " +
      "Views, orders, revenue, and published state are NEVER copied — a duplicate is a fresh creative test, not a stats clone. " +
      "Returns the new draft with its new slug and public link.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = duplicateLandingPageSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID). Unknown fields are rejected.`,
          };
        }

        const newId = await queries.duplicateLandingPage(db, parsed.data.landingPageId);
        if (!newId) {
          return { success: false, error: `Landing page ${parsed.data.landingPageId} not found` };
        }

        const lp = await queries.getLandingPageById(db, newId);
        if (!lp) {
          return { success: false, error: "Failed to load the duplicated landing page" };
        }
        const baseUrl = await resolveStorefrontBaseUrl(db, env?.STOREFRONT_URL);
        return {
          success: true,
          landingPage: lp,
          publicPath: `/lp/${lp.slug}`,
          publicUrl: buildLandingPagePublicUrl(baseUrl, lp.slug),
          note: "Fresh draft created — views, orders, and revenue start at zero. Edit it, then publishLandingPage when ready.",
        };
      } catch (error) {
        return { success: false, error: `Failed to duplicate landing page: ${(error as Error).message}` };
      }
    },
  }),

  unpublishLandingPage: tool({
    description:
      "Return a published landing page to draft — its /lp/<slug> link stops resolving (404) but views and order attribution history stay intact. " +
      "Publish again anytime with publishLandingPage.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = unpublishLandingPageSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID). Unknown fields are rejected.`,
          };
        }

        const existing = await queries.getLandingPageById(db, parsed.data.landingPageId);
        if (!existing) {
          return { success: false, error: `Landing page ${parsed.data.landingPageId} not found` };
        }

        await queries.unpublishLandingPage(db, parsed.data.landingPageId);
        const lp = await queries.getLandingPageById(db, parsed.data.landingPageId);
        const baseUrl = await resolveStorefrontBaseUrl(db, env?.STOREFRONT_URL);
        return {
          success: true,
          landingPage: lp,
          publicPath: `/lp/${lp?.slug ?? existing.slug}`,
          publicUrl: buildLandingPagePublicUrl(baseUrl, lp?.slug ?? existing.slug),
        };
      } catch (error) {
        return { success: false, error: `Failed to unpublish: ${(error as Error).message}` };
      }
    },
  }),

  archiveLandingPage: tool({
    description:
      "Retire a landing page: the link stops resolving and the page leaves the active lists, but its order attribution history stays intact. " +
      "This is the REQUIRED exit for a page with attributed orders — deleteLandingPage refuses those and tells you to archive instead. " +
      "The page stays inspectable: its stats and attribution history remain queryable via getLandingPageDetails and getLandingPageStats.",
    inputSchema: z.object({}).passthrough(), // Layer 1: Permissive input
    execute: async (args) => {
      try {
        const parsed = archiveLandingPageSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid arguments: ${formatIssues(parsed.error)}. Expected: landingPageId (UUID). Unknown fields are rejected.`,
          };
        }

        const existing = await queries.getLandingPageById(db, parsed.data.landingPageId);
        if (!existing) {
          return { success: false, error: `Landing page ${parsed.data.landingPageId} not found` };
        }

        await queries.archiveLandingPage(db, parsed.data.landingPageId);
        const lp = await queries.getLandingPageById(db, parsed.data.landingPageId);
        return {
          success: true,
          landingPage: lp,
          message: "Landing page archived — its order attribution history is preserved.",
        };
      } catch (error) {
        return { success: false, error: `Failed to archive landing page: ${(error as Error).message}` };
      }
    },
  }),
});
