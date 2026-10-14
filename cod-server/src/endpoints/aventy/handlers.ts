import type { Context } from "hono";
import { z } from "@hono/zod-openapi";
import type { AppContext } from "@/types";
import { BusinessLogicError, NotFoundError } from "@/lib/errors/classes";
import { ACTIONS, logActivity } from "@/lib/activity";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { aventySyncState } from "../../../../cod-shared/db/schema";
import { channelKeyStatus, removeChannelKey, saveChannelKey } from "@/aventy/keys";

export const saveKeySchema = z.object({
  key: z.string().trim().min(16).max(512).openapi({ description: "The channel's key, created by the merchant in Aventy. Never returned." }),
});

export async function getAventyKey(c: Context<AppContext>) {
  return c.json({ success: true, data: { ...(await channelKeyStatus(c.get("db"))), encryptionConfigured: c.env.AVENTY_KEY_VAULT !== null } });
}

export async function saveAventyKey(c: Context<AppContext>) {
  const vault = c.env.AVENTY_KEY_VAULT;
  if (!vault) throw new BusinessLogicError("This platform has no AVENTY_KEY_ENCRYPTION_KEY, so it cannot store Aventy keys", ERROR_CODES.AVENTY_NOT_CONFIGURED);
  const { key } = (c.req as unknown as { valid(target: "json"): z.infer<typeof saveKeySchema> }).valid("json");
  const db = c.get("db");
  await saveChannelKey(db, vault, c.get("storeId")!, key);
  await logActivity(db, c.get("user"), ACTIONS.AVENTY_KEY_SAVED, { type: "store", id: c.get("storeId")!, label: "Aventy key" }, {});
  return c.json({ success: true, data: { ...(await channelKeyStatus(db)), encryptionConfigured: true } });
}

export async function removeAventyKey(c: Context<AppContext>) {
  const db = c.get("db");
  if (!(await removeChannelKey(db))) throw new NotFoundError("Aventy key", c.get("storeId")!);
  await logActivity(db, c.get("user"), ACTIONS.AVENTY_KEY_REMOVED, { type: "store", id: c.get("storeId")!, label: "Aventy key" }, {});
  return c.json({ success: true, data: { ...(await channelKeyStatus(db)), encryptionConfigured: c.env.AVENTY_KEY_VAULT !== null } });
}

export async function getAventySync(c: Context<AppContext>) {
  const rows = await c.get("db")
    .select({ domain: aventySyncState.domain, syncedAt: aventySyncState.syncedAt, lastError: aventySyncState.lastError })
    .from(aventySyncState);
  return c.json({
    success: true,
    data: rows.map((r) => ({ domain: r.domain, syncedAt: r.syncedAt?.toISOString() ?? null, lastError: r.lastError })),
  });
}
