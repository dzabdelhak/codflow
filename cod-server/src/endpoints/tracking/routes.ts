import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as h from "./handlers";
import { testEventSchema } from "./validation";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const TestResultSchema = z.object({
  provider: z.enum(["meta", "tiktok", "snap", "ga4"]),
  ok: z.boolean(),
  message: z.string().nullable().openapi({ description: "Why the provider refused the event; `test_event_code_missing` when Meta or TikTok has no test event code" }),
  reference: z.string().nullable(),
});

const ConversionEventSchema = z
  .object({
    id: z.string(),
    provider: z.enum(["meta", "tiktok", "snap", "ga4"]),
    eventName: z.enum(["Purchase", "Lead"]),
    stage: z.enum(["checkout", "confirmed", "delivered"]),
    status: z.enum(["pending", "running", "done", "failed"]),
    attempts: z.number().int(),
    lastError: z.string().nullable(),
    result: z.unknown(),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
    nextAttemptAt: z.string(),
    orderId: z.string().nullable(),
    orderNumber: z.string().nullable(),
  })
  .openapi("ConversionEvent");

const testRoute = defineRoute({
  method: "post",
  path: "/test",
  auth: "admin",
  tags: ["Tracking"],
  summary: "Send a test conversion to one provider",
  description: "Checks the saved credentials of the active channel against the provider without counting a real conversion.",
  operationId: "sendTrackingTestEvent",
  body: testEventSchema,
  responses: { 200: { description: "What the provider answered", content: jsonContent(SuccessResponseSchema(TestResultSchema)) } },
  handler: h.sendTestEvent,
});

const eventsRoute = defineRoute({
  method: "get",
  path: "/events",
  auth: "admin",
  tags: ["Tracking"],
  summary: "Recent server-side conversions",
  description: "The channel's queued conversions, newest first: one per provider and order, with attempts and the last error.",
  operationId: "listConversionEvents",
  query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
  responses: { 200: { description: "Recent conversions", content: jsonContent(SuccessResponseSchema(z.array(ConversionEventSchema))) } },
  handler: h.listEvents,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(testRoute.route, testRoute.handler);
router.openapi(eventsRoute.route, eventsRoute.handler);

export default router;
