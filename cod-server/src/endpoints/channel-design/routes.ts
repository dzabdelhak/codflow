import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as h from "./handlers";
import { draftSchema, restoreSchema, templateSchema } from "./validation";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const DesignStateSchema = z
  .object({
    templateId: z.string().openapi({ description: "The channel's ready-made template", example: "theme01" }),
    manifest: z.object({}).passthrough().openapi({ description: "The template manifest: the sections it renders, their settings, and the fonts it allows" }),
    current: z.object({}).passthrough().openapi({ description: "What the editor shows: the draft, else the published document, else the template default" }),
    draft: z.object({}).passthrough().nullable(),
    published: z.object({}).passthrough().nullable(),
    versions: z.array(z.object({ version: z.number(), publishedAt: z.string(), publishedBy: z.string().nullable() })),
  })
  .openapi("ChannelDesignState");

const stateResponse = { 200: { description: "The channel's design", content: jsonContent(SuccessResponseSchema(DesignStateSchema)) } };

const getRoute = defineRoute({
  method: "get",
  path: "/",
  auth: "admin",
  tags: ["Channel Design"],
  summary: "Get the channel's design",
  description: "The template manifest of the active channel, its draft, its published section-state document and every published version.",
  operationId: "getChannelDesign",
  responses: stateResponse,
  handler: h.get,
});

const draftRoute = defineRoute({
  method: "put",
  path: "/draft",
  auth: "admin",
  tags: ["Channel Design"],
  summary: "Save the draft",
  description:
    "Replaces the draft with a whole section-state document (`{ brand, sections[] }`) — the same document Aventy would send. It is checked against the template manifest (400 VALIDATION_FAILED with `errors`): only declared sections and settings, essential sections shown, safe links. The public pages are unchanged until it is published.",
  operationId: "saveChannelDesignDraft",
  body: draftSchema,
  responses: stateResponse,
  handler: h.saveDraft,
});

const discardRoute = defineRoute({
  method: "delete",
  path: "/draft",
  auth: "admin",
  tags: ["Channel Design"],
  summary: "Return to the published version",
  description: "Drops the draft: the editor shows the published document again.",
  operationId: "discardChannelDesignDraft",
  responses: stateResponse,
  handler: h.discardDraft,
});

const publishRoute = defineRoute({
  method: "post",
  path: "/publish",
  auth: "admin",
  tags: ["Channel Design"],
  summary: "Publish the draft",
  description:
    "Publishes the draft as version N+1, applies its brand to the channel and refreshes the public pages. 409 DESIGN_NOTHING_TO_PUBLISH when there is no draft (a channel never published can publish its template default).",
  operationId: "publishChannelDesign",
  responses: stateResponse,
  handler: h.publish,
});

const restoreRoute = defineRoute({
  method: "post",
  path: "/restore",
  auth: "admin",
  tags: ["Channel Design"],
  summary: "Restore a published version into the draft",
  description: "Copies an earlier published version into the draft, to review and publish again.",
  operationId: "restoreChannelDesignVersion",
  body: restoreSchema,
  responses: stateResponse,
  handler: h.restore,
});

const templateRoute = defineRoute({
  method: "put",
  path: "/template",
  auth: "admin",
  tags: ["Channel Design"],
  summary: "Change the channel's template",
  description:
    "Switches the channel to another ready-made template of its type and loads that template's design (colours, font, sections and texts; the logo is kept) into the draft. The public pages keep the published design until the draft is published; discarding the draft returns to it. 400 VALIDATION_FAILED on `templateId` for a template of another type or an unknown one.",
  operationId: "changeChannelTemplate",
  body: templateSchema,
  responses: stateResponse,
  handler: h.changeTemplate,
});

const previewRoute = defineRoute({
  method: "post",
  path: "/preview",
  auth: "admin",
  tags: ["Channel Design"],
  summary: "Get a preview link",
  description:
    "A token valid one hour: the storefront at `https://<hostname>/?preview=<token>` renders the draft (even before the channel is published), uncached, without tracking, and refuses orders from it.",
  operationId: "previewChannelDesign",
  responses: {
    200: {
      description: "The preview token",
      content: jsonContent(SuccessResponseSchema(z.object({ hostname: z.string(), token: z.string(), expiresAt: z.string() }))),
    },
  },
  handler: h.preview,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(getRoute.route, getRoute.handler);
router.openapi(draftRoute.route, draftRoute.handler);
router.openapi(discardRoute.route, discardRoute.handler);
router.openapi(publishRoute.route, publishRoute.handler);
router.openapi(restoreRoute.route, restoreRoute.handler);
router.openapi(templateRoute.route, templateRoute.handler);
router.openapi(previewRoute.route, previewRoute.handler);

export default router;
