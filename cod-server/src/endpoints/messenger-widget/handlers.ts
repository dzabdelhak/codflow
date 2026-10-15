import type { Context } from "hono";
import { eq } from "drizzle-orm";
import type { AppContext } from "@/types";
import { NotFoundError, ValidationError } from "@/lib/errors/classes";
import { schedulePurge } from "@/platform/storefront-cache";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { stores } from "../../../../cod-shared/db/schema";
import { first } from "../../../../cod-shared/db/client";
import {
  MESSENGER_LIMITS,
  MESSENGER_POSITIONS,
  parseMessengerWidgetConfig,
  serializeMessengerWidgetConfig,
  validateMessengerWidgetInput,
} from "../../../../cod-shared/messenger-widget/config";

const CAPABILITIES = { positions: MESSENGER_POSITIONS, limits: MESSENGER_LIMITS } as const;

export async function getMessengerWidget(c: Context<AppContext>) {
  const row = await c.get("db").select({ json: stores.messengerWidgetJson }).from(stores).where(eq(stores.id, c.get("storeId")!)).then(first);
  if (!row) throw new NotFoundError("Store", c.get("storeId")!);
  return c.json({ success: true, data: { config: parseMessengerWidgetConfig(row.json), capabilities: CAPABILITIES } }, 200);
}

export async function saveMessengerWidget(c: Context<AppContext>) {
  const result = validateMessengerWidgetInput(await c.req.json().catch(() => null));
  if (!result.ok) {
    throw new ValidationError("The Messenger button settings are not valid", ERROR_CODES.VALIDATION_FAILED, { issues: result.issues });
  }
  const off = !result.config.enabled && result.config.page === "";
  await c.get("db")
    .update(stores)
    .set({ messengerWidgetJson: off ? null : serializeMessengerWidgetConfig(result.config), updatedAt: new Date().toISOString() })
    .where(eq(stores.id, c.get("storeId")!));
  schedulePurge(c.env, c.get("storeId"));
  return c.json({ success: true, data: { config: result.config, capabilities: CAPABILITIES } }, 200);
}
