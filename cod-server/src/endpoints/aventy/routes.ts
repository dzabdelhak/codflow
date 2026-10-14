import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as h from "./handlers";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const KeySchema = z
  .object({
    configured: z.boolean(),
    hint: z.string().nullable().openapi({ description: "The key's last four characters, masked; the key itself is never returned" }),
    status: z.enum(["active", "revoked"]).nullable(),
    statusDetail: z.string().nullable(),
    statusChangedAt: z.string().nullable(),
    encryptionConfigured: z.boolean().openapi({ description: "Whether this platform can store Aventy keys (AVENTY_KEY_ENCRYPTION_KEY)" }),
  })
  .openapi("AventyKey");

const keyResponse = { 200: { description: "The channel's Aventy key status", content: jsonContent(SuccessResponseSchema(KeySchema)) } };

const getKey = defineRoute({
  method: "get",
  path: "/key",
  auth: "admin",
  tags: ["Aventy"],
  summary: "Aventy key status",
  description: "Whether the active channel has an Aventy key, its last four characters and whether Aventy still accepts it.",
  operationId: "getAventyKey",
  responses: keyResponse,
  handler: h.getAventyKey,
});

const saveKey = defineRoute({
  method: "put",
  path: "/key",
  auth: "admin",
  tags: ["Aventy"],
  summary: "Save the channel's Aventy key",
  description: "Stores the key encrypted (AES-256-GCM, bound to the channel); replaces the previous one, reactivates a revoked channel and resumes its waiting orders. 422 AVENTY_NOT_CONFIGURED when the platform has no encryption key.",
  operationId: "saveAventyKey",
  body: h.saveKeySchema,
  responses: keyResponse,
  handler: h.saveAventyKey,
});

const removeKey = defineRoute({
  method: "delete",
  path: "/key",
  auth: "admin",
  tags: ["Aventy"],
  summary: "Remove the channel's Aventy key",
  description: "Orders keep waiting in the transmission queue until a key is saved again.",
  operationId: "removeAventyKey",
  responses: keyResponse,
  handler: h.removeAventyKey,
});

const getSync = defineRoute({
  method: "get",
  path: "/sync",
  auth: "admin",
  tags: ["Aventy"],
  summary: "Aventy sync status",
  description: "For each domain pulled from Aventy (catalogue, delivery): when it last synced and the last error.",
  operationId: "getAventySync",
  responses: {
    200: {
      description: "Sync status per domain",
      content: jsonContent(SuccessResponseSchema(z.array(z.object({
        domain: z.enum(["catalogue", "delivery"]),
        syncedAt: z.string().nullable(),
        lastError: z.string().nullable(),
      })))),
    },
  },
  handler: h.getAventySync,
});

const importCatalogue = defineRoute({
  method: "post",
  path: "/catalogue/import",
  auth: "admin",
  tags: ["Aventy"],
  summary: "Import the merchant's Aventy catalogue",
  description: "For a merchant that came from Aventy: copies its Aventy products into the merchant's catalogue (versioned like the channel sync, published in no channel), so the creation wizard can offer them. `linked: false` for any other merchant, or when the platform has no Aventy client.",
  operationId: "importAventyCatalogue",
  responses: {
    200: {
      description: "What was imported",
      content: jsonContent(SuccessResponseSchema(z.object({
        linked: z.boolean(),
        listed: z.number().int().optional(),
        applied: z.number().int().optional(),
      }))),
    },
  },
  handler: h.importAventyCatalogue,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(getKey.route, getKey.handler);
router.openapi(saveKey.route, saveKey.handler);
router.openapi(removeKey.route, removeKey.handler);
router.openapi(getSync.route, getSync.handler);
router.openapi(importCatalogue.route, importCatalogue.handler);

export default router;
