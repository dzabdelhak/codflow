/**
 * Images Routes
 *
 * Two routers, two different worlds (both mounted in src/app.ts):
 *   - uploadRouter → /api/images/*   (auth + `products:manage` scope)
 *       POST /upload  — multipart upload, checked and stored as WebP
 *
 *   - serveRouter   → /images/:key{.+}  (public, no auth)
 *       Serves stored images and resized variants. Plain Hono: the route needs
 *       Hono's regex param (`:key{.+}`) so keys with slashes match, which
 *       cannot be expressed in a @hono/zod-openapi createRoute path. Its
 *       documentation is preserved as a legacy path entry in openapi.ts.
 *
 * Built with defineRoute() — the standard route-builder pattern.
 * MIME-type and size checks stay in the handlers to preserve their
 * specific error codes.
 */

import { OpenAPIHono, z } from "@hono/zod-openapi";
import { Hono } from "hono";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import * as h from "./handlers";
import { bodyLimit } from "hono/body-limit";
import { MAX_UPLOAD_BYTES } from "@/platform/image-pipeline";
import { UploadedImageSchema, SuccessResponseSchema } from "@/openapi/schemas";

const jsonContent = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const uploadImageRoute = defineRoute({
  method: "post",
  path: "/upload",
  auth: { scope: SCOPES.PRODUCTS_MANAGE },
  tags: ["Images"],
  summary: "Upload image",
  description:
    "Upload an image (JPEG, PNG, WebP or GIF, max 10 MB) as multipart/form-data: a `file` field and an optional `folder` (`products` — the default —, `landing`, `branding`). The type is read from the file's bytes, not its name or declared type. The image is stored as WebP, at most 2400 px on its longest side; the response gives its key, public URL and size. Resized versions are served at `{url}?w=&h=&fit=`.",
  operationId: "uploadImage",
  bodyContent: {
    "multipart/form-data": {
      schema: z.object({
        file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
        folder: z.enum(["products", "landing", "branding"]).optional(),
      }),
    },
  },
  responses: {
    201: {
      description: "Image uploaded successfully",
      content: jsonContent(SuccessResponseSchema(UploadedImageSchema)),
    },
    400: {
      description:
        "Validation error - missing file, not an image, unreadable, or file too large (VALIDATION_FAILED / REQUIRED_FIELD_MISSING / INVALID_FILE_TYPE / FILE_TOO_LARGE)",
    },
    500: { description: "System error - storage failure (INTERNAL_SERVER_ERROR)" },
  },
  handler: h.uploadImage,
});

// ─── Routers ──────────────────────────────────────────────────────────────────

// Upload route — requires auth (goes through /api/* middleware)
export const uploadRouter = new OpenAPIHono<AppContext>();
uploadRouter.use(
  "/upload",
  bodyLimit({
    maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
    onError: (c) => c.json({ error: "File too large. Max 10 MB", code: "FILE_TOO_LARGE", category: "VALIDATION" }, 413),
  }),
);
uploadRouter.openapi(uploadImageRoute.route, uploadImageRoute.handler);

// Serve route — no auth, mounted outside /api/*
// Plain Hono on purpose: `:key{.+}` regex param is required so that object
// keys containing slashes (e.g. "products/abc.jpg") keep matching. See the
// module docblock above.
const serveRouter = new Hono<AppContext>();
serveRouter.get("/:key{.+}", h.serveImage);

export { serveRouter };
