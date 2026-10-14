import type pg from "pg";
import { verifySignedJwt, type SessionJwtPayload } from "@/lib/session-auth";
import { ALL_SCOPES } from "../../../cod-shared/rbac/scopes";
import { authorizationServerIssuer as issuerOf, mcpResourceUrl as resourceOf } from "../../../cod-shared/lib/mcp-urls";
import type { McpProps } from "./props";

interface AccessEnv {
  BETTER_AUTH_URL: string;
  PUBLIC_API_URL: string;
  BETTER_AUTH_JWKS_URL?: string;
}

export interface McpAccessClaims extends SessionJwtPayload {
  azp?: string;
  iat?: number;
  scope?: string;
  store_id?: string;
}

export function mcpResourceUrl(env: Pick<AccessEnv, "PUBLIC_API_URL">): string {
  return resourceOf(env.PUBLIC_API_URL);
}

export function authorizationServerIssuer(env: Pick<AccessEnv, "BETTER_AUTH_URL">): string {
  return issuerOf(env.BETTER_AUTH_URL);
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
    consentedAt: number | null;
    owned: string[];
  }>(
    `select u.name, u.email, u.role, u.status, u.merchant_id as "merchantId", s.status as "storeStatus",
            c.scopes as consented, floor(extract(epoch from c.created_at))::int as "consentedAt",
            array(select scope from user_scopes where user_id = u.id) as owned
       from users u join stores s on s.merchant_id = u.merchant_id and s.id = $2
       left join lateral (
         select scopes, created_at from "oauthConsents"
          where user_id = u.id and client_id = $3 and reference_id = s.id
          order by updated_at desc limit 1
       ) c on true
      where u.id = $1`,
    [claims.sub, claims.store_id, claims.azp],
  );
  if (!row) return { ok: false, status: 403, error: "insufficient_scope" };
  if (row.status && row.status !== "active") return { ok: false, status: 403, error: "insufficient_scope" };
  if (row.storeStatus === "archived") return { ok: false, status: 403, error: "insufficient_scope" };
  if (!row.consented || row.consentedAt === null) return { ok: false, status: 401, error: "invalid_token" };
  if (typeof claims.iat !== "number" || claims.iat < row.consentedAt) return { ok: false, status: 401, error: "invalid_token" };

  const userScopes = new Set(row.role === "admin" || row.owned.includes("*") ? ALL_SCOPES : row.owned);
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
