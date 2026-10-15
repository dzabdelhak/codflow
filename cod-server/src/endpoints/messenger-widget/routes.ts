import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as h from "./handlers";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const ConfigSchema = z
  .object({
    enabled: z.boolean(),
    page: z.string().openapi({ description: "The Facebook page's username or numeric id", example: "MaisonLina" }),
    position: z.enum(["right", "left"]),
    label: z.string().openapi({ description: "Optional text beside the button" }),
  })
  .openapi("MessengerWidgetConfig");

const StateSchema = z.object({
  config: ConfigSchema,
  capabilities: z.object({ positions: z.array(z.string()), limits: z.object({}).passthrough() }),
});

const responses = { 200: { description: "The channel's Messenger button", content: jsonContent(SuccessResponseSchema(StateSchema)) } };

const getRoute = defineRoute({
  method: "get",
  path: "/",
  auth: "admin",
  tags: ["Messenger"],
  summary: "Get the Messenger button",
  description: "The active channel's Messenger chat button: whether it shows, the Facebook page it opens (m.me/<page>), its side and label.",
  operationId: "getMessengerWidget",
  responses,
  handler: h.getMessengerWidget,
});

const saveRoute = defineRoute({
  method: "put",
  path: "/",
  auth: "admin",
  tags: ["Messenger"],
  summary: "Save the Messenger button",
  description: "Replaces the channel's Messenger button. A pasted page link is reduced to the page's username or id; turning it on needs a page (400 VALIDATION_FAILED with the issues).",
  operationId: "saveMessengerWidget",
  body: ConfigSchema.partial(),
  responses,
  handler: h.saveMessengerWidget,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(getRoute.route, getRoute.handler);
router.openapi(saveRoute.route, saveRoute.handler);

export default router;
