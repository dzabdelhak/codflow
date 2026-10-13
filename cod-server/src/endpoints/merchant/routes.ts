/**
 * Merchant-level routes: the stores of the signed-in user's merchant (the
 * dashboard's header dropdown). Not scoped to the active store.
 */
import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as handlers from "./handlers";
import { createStoreSchema } from "./validation";

const MerchantStoreSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    logoUrl: z.string().nullable(),
    hostname: z.string().nullable(),
  })
  .openapi("MerchantStore");

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const listStoresRoute = defineRoute({
  method: "get",
  path: "/stores",
  auth: "api-key",
  tags: ["Merchant"],
  summary: "List my stores",
  description: "The stores of the signed-in user's merchant, for the store switcher.",
  operationId: "listMerchantStores",
  responses: {
    200: { description: "The merchant's stores", content: jsonContent(SuccessResponseSchema(z.array(MerchantStoreSchema))) },
  },
  handler: handlers.listStores,
});

const createStoreRoute = defineRoute({
  method: "post",
  path: "/stores",
  auth: "admin",
  tags: ["Merchant"],
  summary: "Create a store",
  description:
    "Creates a store for the merchant on `<subdomain>.<base domain>`, with its four legal pages. Refused when the merchant's plan allows no more stores.",
  operationId: "createMerchantStore",
  body: createStoreSchema,
  responses: {
    201: { description: "The new store", content: jsonContent(SuccessResponseSchema(MerchantStoreSchema)) },
  },
  handler: handlers.createStore,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(listStoresRoute.route, listStoresRoute.handler);
router.openapi(createStoreRoute.route, createStoreRoute.handler);

export default router;
