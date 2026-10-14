import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import { UNAVAILABLE_RULES } from "../../../../cod-shared/channels/types";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as h from "./handlers";
import { mainProductSchema, ruleSchema } from "./validation";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const LandingChannelSchema = z
  .object({
    unavailableRule: z.enum(UNAVAILABLE_RULES),
    available: z.boolean().openapi({ description: "The main product is active, visible, not deleted and published on this landing" }),
    mainProduct: z
      .object({
        productId: z.string(),
        name: z.string(),
        handle: z.string(),
        price: z.number(),
        status: z.string(),
        visibility: z.boolean(),
        published: z.boolean(),
        deleted: z.boolean(),
        primaryImageSrc: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("LandingChannel");

const landingResponse = {
  200: { description: "The landing channel", content: jsonContent(SuccessResponseSchema(LandingChannelSchema)) },
  409: { description: "The active store is not a landing channel (NOT_A_LANDING_CHANNEL)" },
};

const getRoute = defineRoute({
  method: "get",
  path: "/",
  auth: { scope: SCOPES.PRODUCTS_READ },
  tags: ["Landing Channel"],
  summary: "Get the landing's main product and unavailability rule",
  description: "For the active landing channel: its one main product, whether it is available on the public page, and what the page does while it is not.",
  operationId: "getLandingChannel",
  responses: landingResponse,
  handler: h.get,
});

const replaceRoute = defineRoute({
  method: "put",
  path: "/main-product",
  auth: { scope: SCOPES.PRODUCTS_UPDATE },
  tags: ["Landing Channel"],
  summary: "Replace the landing's main product",
  description:
    "The explicit way to change what a landing sells: the chosen catalogue product becomes its only product, published. The catalogue and other channels are untouched.",
  operationId: "replaceLandingMainProduct",
  body: mainProductSchema,
  responses: landingResponse,
  handler: h.replace,
});

const ruleRoute = defineRoute({
  method: "patch",
  path: "/",
  auth: { scope: SCOPES.PRODUCTS_UPDATE },
  tags: ["Landing Channel"],
  summary: "Set what the landing does while its main product is unavailable",
  description:
    "`hide_order_form` keeps the page without its order form, `show_unavailable` replaces the form with an unavailability notice, `suspend` answers the public page with 503 CHANNEL_UNAVAILABLE until the product is available again.",
  operationId: "setLandingUnavailableRule",
  body: ruleSchema,
  responses: landingResponse,
  handler: h.updateRule,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(getRoute.route, getRoute.handler);
router.openapi(replaceRoute.route, replaceRoute.handler);
router.openapi(ruleRoute.route, ruleRoute.handler);

export default router;
