import type pg from "pg";
import { verifySignedJwt, type SessionJwtPayload } from "@/lib/session-auth";
import { ALL_SCOPES } from "../../../cod-shared/rbac/scopes";
import type { McpProps } from "./props";

interface AccessEnv {
  BETTER_AUTH_URL: string;
  WORKER_SELF_URL: string;
  BETTER_AUTH_JWKS_URL?: string;
}

export interface McpAccessClaims extends SessionJwtPayload {
  azp?: string;
  scope?: string;
  store_id?: string;
}

export function mcpResourceUrl(env: Pick<AccessEnv, "WORKER_SELF_URL">): string {
  return `${env.WORKER_SELF_URL.replace(/\/+$/, "")}/mcp`;
}

export function authorizationServerIssuer(env: Pick<AccessEnv, "BETTER_AUTH_URL">): string {
  return `${env.BETTER_AUTH_URL.replace(/\/+$/, "").replace(/\/api\/auth$/, "")}/api/auth`;
}

export async function verifyMcpAccessToken(token: string, env: AccessEnv): Promise<McpAccessClaims & { azp: string; store_id: string }> {
  const claims = await verifySignedJwt<McpAccessClaims>(token, env);
  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!audiences.includes(mcpResourceUrl(env))) throw new Error("The token is not for this resource");
  if (claims.iss !== authorizationServerIssuer(env)) throw new Error("Unknown issuer");
  if (typeof claims.exp !== "number") throw new Error("The token never expires");
  if (!claims.azp || !claims.store_id) throw new Error("The token names no client or channel");
  return claims as McpAccessClaims & { azp: string; store_id: string };
}

export type McpIdentity = { ok: true; props: McpProps } | { ok: false; status: 401 | 403; error: string };

export async function resolveMcpIdentity(
  platform: pg.Pool,
  claims: McpAccessClaims & { azp: string; store_id: string },
): Promise<McpIdentity> {
  const { rows: [row] } = await platform.query<{
    name: string | null;
    email: string;
    role: string;
    status: string | null;
    merchantId: string;
    storeStatus: string;
    consented: string[] | null;
  }>(
    `select u.name, u.email, u.role, u.status, u.merchant_id as "merchantId", s.status as "storeStatus",
            (select c.scopes from "oauthConsents" c
              where c.user_id = u.id and c.client_id = $3 and c.reference_id = s.id
              order by c.updated_at desc limit 1) as consented
       from users u join stores s on s.merchant_id = u.merchant_id and s.id = $2
      where u.id = $1`,
    [claims.sub, claims.store_id, claims.azp],
  );
  if (!row) return { ok: false, status: 403, error: "insufficient_scope" };
  if (row.status && row.status !== "active") return { ok: false, status: 403, error: "insufficient_scope" };
  if (row.storeStatus === "archived") return { ok: false, status: 403, error: "insufficient_scope" };
  if (!row.consented) return { ok: false, status: 401, error: "invalid_token" };

  const { rows: owned } = await platform.query<{ scope: string }>("select scope from user_scopes where user_id = $1", [claims.sub]);
  const userScopes = new Set(row.role === "admin" || owned.some((s) => s.scope === "*") ? ALL_SCOPES : owned.map((s) => s.scope));
  const consented = new Set(row.consented);
  const scopes = (claims.scope ?? "").split(" ").filter((s) => consented.has(s) && userScopes.has(s));

  return {
    ok: true,
    props: {
      userId: claims.sub,
      role: row.role === "admin" ? "admin" : "staff",
      scopes,
      name: row.name ?? "",
      email: row.email,
      storeId: claims.store_id,
      merchantId: row.merchantId,
      clientId: claims.azp,
    },
  };
}
