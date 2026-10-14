import type { Context } from "hono";
import type pg from "pg";
import type { AppContext } from "@/types";
import { NotFoundError } from "@/lib/errors/classes";
import { ACTIONS, logActivity } from "@/lib/activity";
import { platformRedis } from "@/platform/redis";
import { forgetMcpLastUsed, readMcpLastUsed } from "@/mcp/last-used";

export interface McpConnection {
  clientId: string;
  clientName: string | null;
  clientIconUrl: string | null;
  clientHomepageUrl: string | null;
  storeId: string;
  storeName: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
  active: boolean;
  user?: { id: string; name: string; email: string };
}

interface ConnectionRow {
  clientId: string;
  clientName: string | null;
  clientIconUrl: string | null;
  clientHomepageUrl: string | null;
  storeId: string;
  storeName: string;
  scopes: string[];
  connectedAt: Date;
  active: boolean;
  userId: string;
  userName: string | null;
  userEmail: string;
}

async function loadConnections(platform: pg.Pool, merchantId: string, userId: string | null): Promise<ConnectionRow[]> {
  const { rows } = await platform.query<ConnectionRow>(
    `select c.client_id as "clientId", cl.name as "clientName", cl.icon as "clientIconUrl", cl.uri as "clientHomepageUrl",
            s.id as "storeId", s.name as "storeName", c.scopes, c.created_at as "connectedAt",
            exists (select 1 from "oauthRefreshTokens" r
                     where r.user_id = c.user_id and r.client_id = c.client_id and r.reference_id = c.reference_id
                       and r.revoked is null and r.expires_at > now())
              or exists (select 1 from "oauthAccessTokens" a
                     where a.user_id = c.user_id and a.client_id = c.client_id and a.reference_id = c.reference_id
                       and a.revoked is null and a.expires_at > now()) as active,
            u.id as "userId", u.name as "userName", u.email as "userEmail"
       from "oauthConsents" c
       join users u on u.id = c.user_id and u.merchant_id = $1
       join stores s on s.id = c.reference_id and s.merchant_id = $1
       left join "oauthClients" cl on cl.client_id = c.client_id
      where $2::text is null or c.user_id = $2`,
    [merchantId, userId],
  );
  return rows;
}

async function toConnections(c: Context<AppContext>, rows: ConnectionRow[], withUser: boolean): Promise<McpConnection[]> {
  const redis = await platformRedis(c.env.REDIS_URL);
  const lastUsed = await readMcpLastUsed(redis, rows.map((r) => ({ userId: r.userId, clientId: r.clientId, storeId: r.storeId })));
  return rows
    .map((r, i) => ({
      clientId: r.clientId,
      clientName: r.clientName,
      clientIconUrl: r.clientIconUrl,
      clientHomepageUrl: r.clientHomepageUrl,
      storeId: r.storeId,
      storeName: r.storeName,
      scopes: [...r.scopes].sort(),
      connectedAt: r.connectedAt.toISOString(),
      lastUsedAt: lastUsed[i],
      active: r.active,
      ...(withUser ? { user: { id: r.userId, name: r.userName ?? "", email: r.userEmail } } : {}),
    }))
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.lastUsedAt ?? b.connectedAt).localeCompare(a.lastUsedAt ?? a.connectedAt);
    });
}

async function revokeGrants(
  c: Context<AppContext>,
  target: { merchantId: string; userId: string | null; clientId: string; storeId: string | null },
): Promise<Array<{ userId: string; storeId: string }>> {
  const platform = c.env.DATABASE.platform;
  const client = await platform.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ userId: string; storeId: string }>(
      `delete from "oauthConsents" c
        using users u, stores s
        where u.id = c.user_id and u.merchant_id = $1
          and s.id = c.reference_id and s.merchant_id = $1
          and c.client_id = $2
          and ($3::text is null or c.user_id = $3)
          and ($4::text is null or c.reference_id = $4)
       returning c.user_id as "userId", c.reference_id as "storeId"`,
      [target.merchantId, target.clientId, target.userId, target.storeId],
    );
    for (const table of ["oauthRefreshTokens", "oauthAccessTokens"]) {
      await client.query(
        `update "${table}" t set revoked = now()
           from users u, stores s
          where u.id = t.user_id and u.merchant_id = $1
            and s.id = t.reference_id and s.merchant_id = $1
            and t.client_id = $2 and t.revoked is null
            and ($3::text is null or t.user_id = $3)
            and ($4::text is null or t.reference_id = $4)`,
        [target.merchantId, target.clientId, target.userId, target.storeId],
      );
    }
    await client.query("commit");
    const redis = await platformRedis(c.env.REDIS_URL);
    await Promise.all(rows.map((r) => forgetMcpLastUsed(redis, { ...r, clientId: target.clientId })));
    return rows;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listMyConnections(c: Context<AppContext>) {
  const user = c.get("user");
  const connections = await toConnections(c, await loadConnections(c.env.DATABASE.platform, user.merchantId, user.id), false);
  return c.json({ success: true, data: connections, count: connections.length });
}

export async function listTeamConnections(c: Context<AppContext>) {
  const user = c.get("user");
  const connections = await toConnections(c, await loadConnections(c.env.DATABASE.platform, user.merchantId, null), true);
  return c.json({ success: true, data: connections, count: connections.length });
}

export async function revokeMyConnection(c: Context<AppContext>) {
  return revokeConnection(c, c.get("user").id, false);
}

export async function revokeUserConnection(c: Context<AppContext>) {
  return revokeConnection(c, c.req.param("userId")!, true);
}

async function revokeConnection(c: Context<AppContext>, targetUserId: string, byAdmin: boolean) {
  const actor = c.get("user");
  const clientId = c.req.param("clientId")!;
  const storeId = c.req.query("storeId") || null;
  const revoked = await revokeGrants(c, { merchantId: actor.merchantId, userId: targetUserId, clientId, storeId });
  if (revoked.length === 0) throw new NotFoundError("MCP connection", `${targetUserId}:${clientId}`);
  await logActivity(
    c.get("db"),
    actor,
    ACTIONS.MCP_CONNECTION_REVOKED,
    { type: "oauthClient", id: clientId, label: clientId },
    { targetUserId, storeIds: revoked.map((r) => r.storeId), byAdmin },
  );
  return c.json({ success: true, data: { clientId, userId: targetUserId } });
}

export async function deleteMcpClient(c: Context<AppContext>) {
  const actor = c.get("user");
  const clientId = c.req.param("clientId")!;
  const platform = c.env.DATABASE.platform;
  const { rows: [client] } = await platform.query<{ name: string | null; userId: string | null }>(
    `select name, user_id as "userId" from "oauthClients" where client_id = $1`,
    [clientId],
  );
  const revoked = await revokeGrants(c, { merchantId: actor.merchantId, userId: null, clientId, storeId: null });
  if (!client && revoked.length === 0) throw new NotFoundError("MCP client", clientId);

  await platform.query(
    `delete from "oauthClients" cl
      where cl.client_id = $1
        and (cl.user_id is null or cl.user_id in (select id from users where merchant_id = $2))
        and not exists (select 1 from "oauthConsents" where client_id = cl.client_id)
        and not exists (select 1 from "oauthRefreshTokens" where client_id = cl.client_id and revoked is null and expires_at > now())`,
    [clientId, actor.merchantId],
  );
  await logActivity(
    c.get("db"),
    actor,
    ACTIONS.MCP_CLIENT_DELETED,
    { type: "oauthClient", id: clientId, label: client?.name ?? clientId },
    { revokedForUsers: new Set(revoked.map((r) => r.userId)).size },
  );
  return c.json({ success: true, data: { clientId, revokedForUsers: new Set(revoked.map((r) => r.userId)).size } });
}
