import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import { OUTBOUND_OUTCOMES } from "../../../../cod-shared/db/schema";
import * as h from "./handlers";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const EntrySchema = z
  .object({
    sendId: z.string().openapi({ description: "ULID send id, identical on every resend" }),
    orderId: z.string(),
    orderNumber: z.string(),
    status: z.enum(["pending", "sent", "rejected"]),
    attempts: z.number().int(),
    createdAt: z.string(),
    nextAttemptAt: z.string(),
    lastAttemptAt: z.string().nullable(),
    lastOutcome: z.enum(OUTBOUND_OUTCOMES).nullable(),
    outcomeDetail: z.object({ reasons: z.array(z.string()).optional(), fields: z.array(z.string()).optional() }).nullable(),
    lastError: z.string().nullable(),
    sentAt: z.string().nullable(),
    remoteId: z.string().nullable(),
  })
  .openapi("OutboundEntry");

const TransmissionSchema = z
  .object({
    destination: z.string(),
    connection: z.object({
      state: z.enum(["connected", "failing", "idle"]),
      lastAttemptAt: z.string().nullable(),
      lastOutcome: z.enum(OUTBOUND_OUTCOMES).nullable(),
    }),
    lastSuccessAt: z.string().nullable(),
    counts: z.object({ waiting: z.number().int(), sent: z.number().int(), rejected: z.number().int(), stale: z.number().int() }),
    oldestWaitingAt: z.string().nullable(),
    waiting: z.array(EntrySchema),
    rejected: z.array(EntrySchema),
    recentErrors: z.array(EntrySchema),
  })
  .openapi("Transmission");

const response = { 200: { description: "The channel's order transmission", content: jsonContent(SuccessResponseSchema(TransmissionSchema)) } };

const getRoute = defineRoute({
  method: "get",
  path: "/",
  auth: { scope: SCOPES.ORDERS_READ },
  tags: ["Order Transmission"],
  summary: "Order transmission diagnostics",
  description: "Connection state, last successful transmission, waiting / sent / rejected counts, orders waiting more than 24 hours, the waiting and rejected entries and the recent errors of the active channel.",
  operationId: "getOrderTransmission",
  responses: response,
  handler: h.getTransmission,
});

const alertsRoute = defineRoute({
  method: "get",
  path: "/alerts",
  auth: { scope: SCOPES.ORDERS_READ },
  tags: ["Order Transmission"],
  summary: "Order transmission alerts",
  description: "How many of the active channel's orders have waited more than 24 hours, how many were rejected, and whether its Aventy key is revoked or missing — what the dashboard banner shows.",
  operationId: "getOrderTransmissionAlerts",
  responses: {
    200: {
      description: "Alert counts",
      content: jsonContent(SuccessResponseSchema(z.object({
        stale: z.number().int(),
        rejected: z.number().int(),
        aventyKey: z.enum(["missing", "revoked"]).nullable().openapi({ description: "The channel's Aventy key is revoked, or missing while orders go to Aventy: its orders wait in the queue" }),
      }))),
    },
  },
  handler: h.getTransmissionAlerts,
});

const resendRoute = defineRoute({
  method: "post",
  path: "/{sendId}/resend",
  auth: { scope: SCOPES.ORDERS_UPDATE },
  tags: ["Order Transmission"],
  summary: "Resend a rejected order",
  description: "Re-reads the customer and delivery blocks from the order as corrected in the dashboard and queues it again with the same send id. Only a rejected entry can be resent (409 OUTBOUND_NOT_REJECTED).",
  operationId: "resendOutboundOrder",
  params: z.object({ sendId: z.string().min(1).openapi({ param: { name: "sendId", in: "path" } }) }),
  responses: response,
  handler: h.resendRejected,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(getRoute.route, getRoute.handler);
router.openapi(alertsRoute.route, alertsRoute.handler);
router.openapi(resendRoute.route, resendRoute.handler);

export default router;
