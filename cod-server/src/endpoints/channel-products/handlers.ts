import type { Context } from "hono";
import type { AppContext } from "@/types";
import { NotFoundError, ValidationError } from "@/lib/errors/classes";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import {
  addToChannel,
  catalogueProductIds,
  isStoreShippingProfile,
  listChannelProducts,
  removeFromChannel,
  reorderChannel,
  setChannelSelection,
} from "../../../../cod-shared/queries/channel-products";
import type { AddInput, OrderInput, UpdateInput } from "./validation";

function body<T>(c: Context<AppContext>): T {
  return (c.req as unknown as { valid(target: "json"): T }).valid("json");
}

export async function assertStoreShippingProfile(c: Context<AppContext>, profileId: string | null | undefined) {
  if (profileId && !(await isStoreShippingProfile(c.get("db"), profileId))) {
    throw new ValidationError("This shipping profile does not belong to the store", ERROR_CODES.VALIDATION_FAILED, {
      field: "shippingProfileId",
    });
  }
}

export async function list(c: Context<AppContext>) {
  return c.json({ success: true, data: await listChannelProducts(c.get("db")) }, 200);
}

export async function add(c: Context<AppContext>) {
  const db = c.get("db");
  const { productIds } = body<AddInput>(c);
  const known = await catalogueProductIds(db, productIds);
  const unknown = productIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ValidationError("Some products are not in the catalogue", ERROR_CODES.VALIDATION_FAILED, { unknown });
  }
  await addToChannel(db, productIds);
  return c.json({ success: true, data: await listChannelProducts(db) }, 200);
}

export async function update(c: Context<AppContext>) {
  const db = c.get("db");
  const productId = c.req.param("productId")!;
  const current = await listChannelProducts(db);
  if (!current.some((p) => p.productId === productId)) throw new NotFoundError("Channel product", productId);
  const input = body<UpdateInput>(c);
  await assertStoreShippingProfile(c, input.shippingProfileId);
  await setChannelSelection(db, productId, input);
  return c.json({ success: true, data: (await listChannelProducts(db)).find((p) => p.productId === productId) }, 200);
}

export async function reorder(c: Context<AppContext>) {
  const db = c.get("db");
  await reorderChannel(db, body<OrderInput>(c).productIds);
  return c.json({ success: true, data: await listChannelProducts(db) }, 200);
}

export async function remove(c: Context<AppContext>) {
  const productId = c.req.param("productId")!;
  if (!(await removeFromChannel(c.get("db"), productId))) throw new NotFoundError("Channel product", productId);
  return c.json({ success: true }, 200);
}
