import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import { BLOCKED_ORDER_REASONS } from "../../../../cod-shared/db/schema";
import * as h from "./handlers";
import { attemptsQuery, blockedPhoneParams, blockPhoneSchema } from "./validation";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const AttemptSchema = z
  .object({
    id: z.string(),
    storeId: z.string(),
    reason: z.enum(BLOCKED_ORDER_REASONS).openapi({
      description: "blocked_phone: on the account's blocklist; phone_window / device_window: another order within the channel's window; ip_ceiling: dropped, three times the hourly per-address ceiling; ip_flagged: past the ceiling, the order was taken (orderNumber is that order) and is flagged for checking",
    }),
    orderNumber: z.string().openapi({ description: "The number the visitor was shown; no order carries it" }),
    phone: z.string(),
    customerName: z.string(),
    deviceId: z.string().nullable(),
    ipAddress: z.string().nullable(),
    details: z.object({ lines: z.array(z.object({ productName: z.string(), quantity: z.number() })), total: z.number().nullable() }),
    createdAt: z.string(),
  })
  .openapi("BlockedOrderAttempt");

const BlockedPhoneSchema = z
  .object({
    merchantId: z.string(),
    id: z.string(),
    phone: z.string(),
    note: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("BlockedPhone");

const phonesResponse = (status: 200 | 201) => ({
  [status]: { description: "The account's blocklist", content: jsonContent(SuccessResponseSchema(z.array(BlockedPhoneSchema))) },
});

const attemptsRoute = defineRoute({
  method: "get",
  path: "/attempts",
  auth: { scope: SCOPES.ORDERS_READ },
  tags: ["Order Protection"],
  summary: "Blocked order attempts",
  description: "The active channel's orders that were refused by the anti-flood rules, newest first. The visitor saw a normal confirmation; nothing was created.",
  operationId: "listBlockedOrderAttempts",
  query: attemptsQuery,
  responses: { 200: { description: "Blocked attempts", content: jsonContent(SuccessResponseSchema(z.array(AttemptSchema))) } },
  handler: h.listAttempts,
});

const phonesRoute = defineRoute({
  method: "get",
  path: "/blocked-phones",
  auth: { scope: SCOPES.ORDERS_READ },
  tags: ["Order Protection"],
  summary: "The account's blocked phones",
  description: "Shared by every channel of the account: an order from one of these numbers is refused in all of them.",
  operationId: "listBlockedPhones",
  responses: phonesResponse(200),
  handler: h.listBlockedPhones,
});

const blockRoute = defineRoute({
  method: "post",
  path: "/blocked-phones",
  auth: { scope: SCOPES.ORDERS_UPDATE },
  tags: ["Order Protection"],
  summary: "Block a phone number",
  description: "Adds an Algerian mobile number to the account's blocklist. Blocking a number already listed changes nothing.",
  operationId: "blockPhone",
  body: blockPhoneSchema,
  responses: phonesResponse(201),
  handler: h.blockPhone,
});

const unblockRoute = defineRoute({
  method: "delete",
  path: "/blocked-phones/{id}",
  auth: { scope: SCOPES.ORDERS_UPDATE },
  tags: ["Order Protection"],
  summary: "Unblock a phone number",
  operationId: "unblockPhone",
  params: blockedPhoneParams,
  responses: phonesResponse(200),
  handler: h.unblockPhone,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(attemptsRoute.route, attemptsRoute.handler);
router.openapi(phonesRoute.route, phonesRoute.handler);
router.openapi(blockRoute.route, blockRoute.handler);
router.openapi(unblockRoute.route, unblockRoute.handler);

export default router;
