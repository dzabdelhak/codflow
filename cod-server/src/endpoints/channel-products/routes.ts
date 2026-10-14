import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as h from "./handlers";
import { addSchema, orderSchema, productIdParams, updateSchema } from "./validation";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const ChannelProductSchema = z
  .object({
    productId: z.string(),
    name: z.string(),
    handle: z.string(),
    price: z.number(),
    status: z.string(),
    visibility: z.boolean(),
    published: z.boolean(),
    featured: z.boolean(),
    position: z.number(),
    shippingProfileId: z.string().nullable(),
    primaryImageSrc: z.string().nullable(),
  })
  .openapi("ChannelProduct");

const listResponse = { 200: { description: "The store's products, in display order", content: jsonContent(SuccessResponseSchema(z.array(ChannelProductSchema))) } };

const listRoute = defineRoute({
  method: "get",
  path: "/",
  auth: { scope: SCOPES.PRODUCTS_READ },
  tags: ["Channel Products"],
  summary: "List the store's products",
  description:
    "The catalogue products this store carries, in display order, with whether each is published on the storefront and featured on its home page. Prices come from the catalogue.",
  operationId: "listChannelProducts",
  responses: listResponse,
  handler: h.list,
});

const addRoute = defineRoute({
  method: "post",
  path: "/",
  auth: { scope: SCOPES.PRODUCTS_UPDATE },
  tags: ["Channel Products"],
  summary: "Add catalogue products to the store",
  description: "Adds catalogue products to this store, published and appended at the end. Products already in the store are left as they are.",
  operationId: "addChannelProducts",
  body: addSchema,
  responses: listResponse,
  handler: h.add,
});

const updateRoute = defineRoute({
  method: "patch",
  path: "/{productId}",
  auth: { scope: SCOPES.PRODUCTS_UPDATE },
  tags: ["Channel Products"],
  summary: "Publish, feature or set the shipping profile of a store product",
  description: "Changes only this store: the catalogue and other stores are untouched.",
  operationId: "updateChannelProduct",
  params: productIdParams,
  body: updateSchema,
  responses: { 200: { description: "The store product", content: jsonContent(SuccessResponseSchema(ChannelProductSchema)) } },
  handler: h.update,
});

const orderRoute = defineRoute({
  method: "put",
  path: "/order",
  auth: { scope: SCOPES.PRODUCTS_UPDATE },
  tags: ["Channel Products"],
  summary: "Reorder the store's products",
  description: "Sets the display order: `productIds` from first to last.",
  operationId: "reorderChannelProducts",
  body: orderSchema,
  responses: listResponse,
  handler: h.reorder,
});

const removeRoute = defineRoute({
  method: "delete",
  path: "/{productId}",
  auth: { scope: SCOPES.PRODUCTS_UPDATE },
  tags: ["Channel Products"],
  summary: "Remove a product from the store",
  description: "Removes the product from this store only; it stays in the catalogue and in other stores.",
  operationId: "removeChannelProduct",
  params: productIdParams,
  responses: { 200: { description: "Removed", content: jsonContent(z.object({ success: z.boolean() })) } },
  handler: h.remove,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(listRoute.route, listRoute.handler);
router.openapi(addRoute.route, addRoute.handler);
router.openapi(orderRoute.route, orderRoute.handler);
router.openapi(updateRoute.route, updateRoute.handler);
router.openapi(removeRoute.route, removeRoute.handler);

export default router;
