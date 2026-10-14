import { AsyncLocalStorage } from "node:async_hooks";
import { dashboardDatabase, dashboardRedis } from "../server-db";

const CHOICE_TTL_SECONDS = 10 * 60;
const key = (sessionId: string, authorization: string) => `mcp-channel:${sessionId}:${authorization}`;

const currentAuthorization = new AsyncLocalStorage<string | null>();

export function withAuthorization<T>(authorization: string | null, fn: () => T): T {
  return currentAuthorization.run(authorization, fn);
}

export function authorizationInProgress(): string | null {
  return currentAuthorization.getStore() ?? null;
}

export interface ChannelOption {
  id: string;
  name: string;
  type: string;
  status: string;
}

export async function channelsOf(userId: string): Promise<ChannelOption[]> {
  const { rows } = await dashboardDatabase().platform.query<ChannelOption>(
    `select s.id, s.name, s.channel_type as type, s.status
       from users u join stores s on s.merchant_id = u.merchant_id
      where u.id = $1 and s.status <> 'archived'
      order by s.created_at, s.id`,
    [userId],
  );
  return rows;
}

export async function chooseChannel(sessionId: string, authorization: string, userId: string, storeId: string): Promise<boolean> {
  if (!(await channelsOf(userId)).some((c) => c.id === storeId)) return false;
  await (await dashboardRedis()).set(key(sessionId, authorization), storeId, { EX: CHOICE_TTL_SECONDS });
  return true;
}

export async function chosenChannel(sessionId: string, authorization: string | null): Promise<string | null> {
  if (!authorization) return null;
  return (await (await dashboardRedis()).get(key(sessionId, authorization))) ?? null;
}
