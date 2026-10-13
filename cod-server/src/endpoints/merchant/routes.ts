/**
 * Merchant-level routes: the stores of the signed-in user's merchant (the
 * dashboard's header dropdown). Not scoped to the active store.
 */
import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as handlers from "./handlers";
import { changeStoreStatusSchema, createStoreSchema, deleteStoreSchema, StoreIdParamSchema } from "./validation";
import { CHANNEL_STATUSES } from "../../../../cod-shared/channels/lifecycle";

const MerchantStoreSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(CHANNEL_STATUSES),
    logoUrl: z.string().nullable(),
    hostname: z.string().nullable(),
    hasOrders: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("MerchantStore");

const StatusChangeSchema = z
  .object({
    id: z.string(),
    actorName: z.string(),
    from: z.enum(CHANNEL_STATUSES),
    to: z.enum(CHANNEL_STATUSES),
    createdAt: z.string(),
  })
  .openapi("StoreStatusChange");

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

const changeStatusRoute = defineRoute({
  method: "patch",
  path: "/stores/{id}/status",
  auth: "admin",
  tags: ["Merchant"],
  summary: "Change a store's status",
  description: [
    "Moves a store through its lifecycle: draft → configuring → ready → published, and published ⇄ suspended. Any state can be archived; an archived store goes back to draft.",
    "",
    "Only a published store serves its public pages. A suspended store answers the storefront with 503 CHANNEL_UNAVAILABLE and keeps all its data; an archived one is gone from the public web, its orders and logs kept.",
    "",
    "Every change is written to the store's activity log (`store.status_changed`, with who and from/to). 422 INVALID_STATUS_TRANSITION for a move the lifecycle does not allow.",
  ].join("\n"),
  operationId: "changeMerchantStoreStatus",
  params: StoreIdParamSchema,
  body: changeStoreStatusSchema,
  responses: {
    200: { description: "The store, with its new status", content: jsonContent(SuccessResponseSchema(MerchantStoreSchema)) },
  },
  handler: handlers.changeStatus,
});

const statusHistoryRoute = defineRoute({
  method: "get",
  path: "/stores/{id}/status-history",
  auth: "api-key",
  tags: ["Merchant"],
  summary: "A store's status changes",
  description: "Every status change of the store, newest first, with who made it and when.",
  operationId: "listMerchantStoreStatusHistory",
  params: StoreIdParamSchema,
  responses: {
    200: { description: "Status changes", content: jsonContent(SuccessResponseSchema(z.array(StatusChangeSchema))) },
  },
  handler: handlers.statusHistory,
});

const deleteStoreRoute = defineRoute({
  method: "delete",
  path: "/stores/{id}",
  auth: "admin",
  tags: ["Merchant"],
  summary: "Delete a store permanently",
  description:
    "Permanently deletes an archived store that never received an order, after `confirmName` repeats its name. A store with orders stays archived so its orders and logs are kept (422 STORE_NOT_DELETABLE, `reason`: not_archived, has_orders, last_store).",
  operationId: "deleteMerchantStore",
  params: StoreIdParamSchema,
  body: deleteStoreSchema,
  responses: {
    200: { description: "Deleted", content: jsonContent(z.object({ success: z.boolean() })) },
  },
  handler: handlers.deleteStore,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(listStoresRoute.route, listStoresRoute.handler);
router.openapi(createStoreRoute.route, createStoreRoute.handler);
router.openapi(changeStatusRoute.route, changeStatusRoute.handler);
router.openapi(statusHistoryRoute.route, statusHistoryRoute.handler);
router.openapi(deleteStoreRoute.route, deleteStoreRoute.handler);

export default router;
