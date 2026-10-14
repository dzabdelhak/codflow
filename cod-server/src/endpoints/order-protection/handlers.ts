import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { desc, eq } from "drizzle-orm";
import type { AppContext } from "@/types";
import { jsonBody } from "@/lib/route-builder";
import { NotFoundError, ValidationError } from "@/lib/errors/classes";
import { ACTIONS, logActivity } from "@/lib/activity";
import { blockedOrderAttempts, blockedPhones } from "../../../../cod-shared/db/schema";
import { first } from "../../../../cod-shared/db/client";
import { toLocalAlgerianMobile } from "../../../../cod-shared/lib/phone";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import type { BlockPhoneInput } from "./validation";

export async function listAttempts(c: Context<AppContext>) {
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  const rows = await c.get("db").select().from(blockedOrderAttempts).orderBy(desc(blockedOrderAttempts.createdAt)).limit(limit);
  return c.json({ success: true, data: rows }, 200);
}

async function phones(c: Context<AppContext>) {
  return c.get("db").select().from(blockedPhones).orderBy(desc(blockedPhones.createdAt));
}

export async function listBlockedPhones(c: Context<AppContext>) {
  return c.json({ success: true, data: await phones(c) }, 200);
}

export async function blockPhone(c: Context<AppContext>) {
  const input = jsonBody<BlockPhoneInput>(c);
  const phone = toLocalAlgerianMobile(input.phone);
  if (!phone) throw new ValidationError("Enter an Algerian mobile number", ERROR_CODES.INVALID_PHONE_FORMAT, { field: "phone" });
  const user = c.get("user");
  const inserted = await c
    .get("db")
    .insert(blockedPhones)
    .values({ id: randomUUID(), phone, note: input.note || null, createdBy: user?.name ?? user?.id ?? null })
    .onConflictDoNothing()
    .returning({ id: blockedPhones.id });
  if (inserted[0]) await logActivity(c.get("db"), user, ACTIONS.PHONE_BLOCKED, { type: "phone", id: inserted[0].id, label: phone });
  return c.json({ success: true, data: await phones(c) }, 201);
}

export async function unblockPhone(c: Context<AppContext>) {
  const id = c.req.param("id")!;
  const db = c.get("db");
  const row = await db.delete(blockedPhones).where(eq(blockedPhones.id, id)).returning({ phone: blockedPhones.phone }).then(first);
  if (!row) throw new NotFoundError("Blocked phone", id);
  await logActivity(db, c.get("user"), ACTIONS.PHONE_UNBLOCKED, { type: "phone", id, label: row.phone });
  return c.json({ success: true, data: await phones(c) }, 200);
}
