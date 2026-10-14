import { Hono, type Context } from "hono";
import type { AppContext } from "@/types";
import { withStore } from "@/db/scope";
import { platformRedis } from "@/platform/redis";
import { ALL_SCOPES } from "../../../cod-shared/rbac/scopes";
import { authorizationServerIssuer, mcpResourceUrl, resolveMcpIdentity, verifyMcpAccessToken } from "./access";
import { createCodMcpHandler } from "./server-factory";
import { recordMcpLastUsed } from "./last-used";

function resourceMetadataUrl(c: Context<AppContext>): string {
  return `${c.env.WORKER_SELF_URL.replace(/\/+$/, "")}/.well-known/oauth-protected-resource/mcp`;
}

function challenge(c: Context<AppContext>, status: 401 | 403, error?: string): Response {
  const params = [`resource_metadata="${resourceMetadataUrl(c)}"`, ...(error ? [`error="${error}"`] : [])];
  return new Response(JSON.stringify({ error: error ?? "unauthorized" }), {
    status,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer ${params.join(", ")}` },
  });
}

export function protectedResourceMetadata(c: Context<AppContext>) {
  return c.json({
    resource: mcpResourceUrl(c.env),
    authorization_servers: [authorizationServerIssuer(c.env)],
    scopes_supported: ["offline_access", ...ALL_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "CodFlow MCP",
  });
}

export const mcpRoutes = new Hono<AppContext>();

mcpRoutes.all("/", async (c) => {
  const token = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return challenge(c, 401);
  const claims = await verifyMcpAccessToken(token, c.env).catch(() => null);
  if (!claims) return challenge(c, 401, "invalid_token");
  const identity = await resolveMcpIdentity(c.env.DATABASE.platform, claims);
  if (!identity.ok) return challenge(c, identity.status, identity.error);

  const { props } = identity;
  const redis = await platformRedis(c.env.REDIS_URL);
  void recordMcpLastUsed(redis, props);
  return withStore(
    c.env.DATABASE.app,
    props.storeId,
    (db) => createCodMcpHandler(c.env, props, db, redis).fetch(c.req.raw),
    props.merchantId,
  );
});
