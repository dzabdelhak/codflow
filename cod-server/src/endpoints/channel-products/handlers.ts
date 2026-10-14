import type { Context } from "hono";
import type { AppContext } from "@/types";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/classes";
import { assertStoreShippingProfile } from "@/lib/store-shipping-profile";
import { schedulePurge } from "@/platform/storefront-cache";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import {
  addToChannel,
  catalogueProductIds,
  channelProductIds,
  getChannelProduct,
  isCompleteOrder,
  listChannelProducts,
  removeFromChannel,
  reorderChannel,
  setChannelSelection,
} from "../../../../cod-shared/queries/channel-products";
import { isLandingChannel } from "../../../../cod-shared/queries/landing-channel";
import type { AddInput, OrderInput, UpdateInput } from "./validation";

function body<T>(c: Context<AppContext>): T {
  return (c.req as unknown as { valid(target: "json"): T }).valid("json");
}

async function refuseOnLanding(c: Context<AppContext>) {
  if (await isLandingChannel(c.get("db"), c.get("storeId")!)) {
    throw new ConflictError(
      "A landing channel sells one main product: replace it through PUT /api/landing-channel/main-product",
      ERROR_CODES.LANDING_SINGLE_PRODUCT,
    );
  }
}

export async function list(c: Context<AppContext>) {
  return c.json({ success: true, data: await listChannelProducts(c.get("db")) }, 200);
}

export async function add(c: Context<AppContext>) {
  const db = c.get("db");
  const { productIds } = body<AddInput>(c);
  await refuseOnLanding(c);
  const known = await catalogueProductIds(db, productIds);
  const unknown = productIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ValidationError("Some products are not in the catalogue", ERROR_CODES.VALIDATION_FAILED, { unknown });
  }
  await addToChannel(db, productIds);
  schedulePurge(c.env, c.get("storeId"));
  return c.json({ success: true, data: await listChannelProducts(db) }, 200);
}

export async function update(c: Context<AppContext>) {
  const db = c.get("db");
  const productId = c.req.param("productId")!;
  if (!(await getChannelProduct(db, productId))) throw new NotFoundError("Channel product", productId);
  const input = body<UpdateInput>(c);
  await assertStoreShippingProfile(db, input.shippingProfileId);
  await setChannelSelection(db, productId, input);
  schedulePurge(c.env, c.get("storeId"));
  return c.json({ success: true, data: await getChannelProduct(db, productId) }, 200);
}

export async function reorder(c: Context<AppContext>) {
  const db = c.get("db");
  const { productIds } = body<OrderInput>(c);
  if (!isCompleteOrder(await channelProductIds(db), productIds)) {
    throw new ValidationError("List every product of the store exactly once", ERROR_CODES.VALIDATION_FAILED, {
      field: "productIds",
    });
  }
  await reorderChannel(db, productIds);
  schedulePurge(c.env, c.get("storeId"));
  return c.json({ success: true, data: await listChannelProducts(db) }, 200);
}

export async function remove(c: Context<AppContext>) {
  const productId = c.req.param("productId")!;
  await refuseOnLanding(c);
  if (!(await removeFromChannel(c.get("db"), productId))) throw new NotFoundError("Channel product", productId);
  schedulePurge(c.env, c.get("storeId"));
  return c.json({ success: true }, 200);
}
