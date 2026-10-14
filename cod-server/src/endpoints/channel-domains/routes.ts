import { OpenAPIHono, z } from "@hono/zod-openapi";
import { Hono } from "hono";
import type { AppContext } from "@/types";
import { defineRoute } from "@/lib/route-builder";
import { SuccessResponseSchema } from "@/openapi/schemas";
import * as h from "./handlers";
import { addDomainSchema, hostnameParams } from "./validation";

const jsonContent = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

const DomainSchema = z
  .object({
    hostname: z.string(),
    kind: z.enum(["subdomain", "custom"]),
    status: z.enum(["pending", "verified", "failed"]),
    isPrimary: z.boolean(),
    createdAt: z.string(),
    verifiedAt: z.string().nullable(),
    checkedAt: z.string().nullable(),
    lastError: z.string().nullable().openapi({
      description: "Why the last check failed: no_dns_records, points_elsewhere:<values>, dns_lookup_failed or platform_target_not_configured",
    }),
    certificate: z
      .object({ status: z.enum(["active", "missing", "error"]) })
      .passthrough()
      .nullable()
      .openapi({ description: "HTTPS certificate, read live for verified custom domains" }),
  })
  .openapi("ChannelDomain");

const StateSchema = z.object({
  domains: z.array(DomainSchema),
  dns: z.object({ cname: z.string().nullable(), ipv4: z.array(z.string()) }).openapi({
    description: "What a custom domain must point at: a CNAME to `cname`, or A records to `ipv4` for a root domain",
  }),
});

const stateResponse = { 200: { description: "The channel's domains", content: jsonContent(SuccessResponseSchema(StateSchema)) } };

const listRoute = defineRoute({
  method: "get",
  path: "/",
  auth: "admin",
  tags: ["Channel Domains"],
  summary: "List the channel's domains",
  description: "The free subdomain and the custom domains of the active channel, with their verification status, the primary domain, the DNS records to create and, for verified custom domains, the HTTPS certificate.",
  operationId: "listChannelDomains",
  responses: stateResponse,
  handler: h.list,
});

const addRoute = defineRoute({
  method: "post",
  path: "/",
  auth: "admin",
  tags: ["Channel Domains"],
  summary: "Add a custom domain",
  description:
    "Adds a domain or subdomain as pending: it serves nothing and gets no certificate until it is verified. A domain held by another channel answers 409 DOMAIN_TAKEN, unless that claim was never verified and is older than 72 hours.",
  operationId: "addChannelDomain",
  body: addDomainSchema,
  responses: { 201: { description: "Added, pending", content: jsonContent(SuccessResponseSchema(StateSchema)) } },
  handler: h.add,
});

const verifyRoute = defineRoute({
  method: "post",
  path: "/{hostname}/verify",
  auth: "admin",
  tags: ["Channel Domains"],
  summary: "Check a domain's DNS",
  description: "Verified when the domain has a CNAME to the platform target, or A records to the platform's addresses. Otherwise it is marked failed with the reason; a failed domain stops serving.",
  operationId: "verifyChannelDomain",
  params: hostnameParams,
  responses: stateResponse,
  handler: h.verify,
});

const primaryRoute = defineRoute({
  method: "post",
  path: "/{hostname}/primary",
  auth: "admin",
  tags: ["Channel Domains"],
  summary: "Make a domain the primary domain",
  description: "Visitors on the channel's other domains are redirected to the primary one. Only a verified domain can be primary (409 DOMAIN_NOT_VERIFIED).",
  operationId: "setPrimaryChannelDomain",
  params: hostnameParams,
  responses: stateResponse,
  handler: h.makePrimary,
});

const removeRoute = defineRoute({
  method: "delete",
  path: "/{hostname}",
  auth: "admin",
  tags: ["Channel Domains"],
  summary: "Remove a custom domain",
  description: "The free subdomain and the primary domain cannot be removed (409 DOMAIN_NOT_REMOVABLE).",
  operationId: "removeChannelDomain",
  params: hostnameParams,
  responses: stateResponse,
  handler: h.remove,
});

const router = new OpenAPIHono<AppContext>();
router.openapi(listRoute.route, listRoute.handler);
router.openapi(addRoute.route, addRoute.handler);
router.openapi(verifyRoute.route, verifyRoute.handler);
router.openapi(primaryRoute.route, primaryRoute.handler);
router.openapi(removeRoute.route, removeRoute.handler);

export const tlsAskRouter = new Hono<AppContext>();
tlsAskRouter.get("/", h.tlsAsk);

export default router;
