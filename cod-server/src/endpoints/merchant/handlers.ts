import type { Context } from "hono";
import type { AppContext } from "@/types";
import { BusinessLogicError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors/classes";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import {
  changeStoreStatus,
  createMerchantStore,
  deleteMerchantStore,
  listMerchantStores,
  storeStatusHistory,
} from "@/platform/merchant-stores";
import { schedulePurge } from "@/platform/storefront-cache";
import { localPlanPolicy } from "@/platform/plan-policy";
import type { ChangeStoreStatusInput, CreateStoreInput, DeleteStoreInput } from "./validation";

export async function listStores(c: Context<AppContext>) {
  const data = await listMerchantStores(c.env.DATABASE.platform, c.get("user").merchantId);
  return c.json({ success: true, data, baseDomain: c.env.STORE_BASE_DOMAIN ?? "localhost" }, 200);
}

export async function createStore(c: Context<AppContext>) {
  const body = (c.req as unknown as { valid(target: "json"): CreateStoreInput }).valid("json");
  const result = await createMerchantStore(
    c.env.DATABASE.platform,
    {
      merchantId: c.get("user").merchantId,
      type: body.type,
      unavailableRule: body.unavailableRule,
      name: body.name,
      subdomain: body.subdomain,
      baseDomain: c.env.STORE_BASE_DOMAIN ?? "localhost",
      creationKey: body.creationKey,
      productIds: body.productIds,
      deliveryModes: body.deliveryModes,
      defaultShippingProfileId: body.defaultShippingProfileId,
      templateId: body.templateId,
      customDomain: body.customDomain,
    },
    localPlanPolicy(),
  );
  if (result.ok) return c.json({ success: true, data: result.store, created: result.created }, result.created ? 201 : 200);

  switch (result.reason) {
    case "invalid_subdomain":
      throw new ValidationError(
        "A subdomain is 3–40 letters, digits or hyphens, and cannot be a reserved name",
        ERROR_CODES.INVALID_SUBDOMAIN,
        { field: "subdomain" },
      );
    case "subdomain_taken":
      throw new ConflictError("This subdomain is already used by another store", ERROR_CODES.SUBDOMAIN_TAKEN, {
        field: "subdomain",
      });
    case "plan_limit":
      throw new BusinessLogicError("Your plan does not allow another store", ERROR_CODES.STORE_LIMIT_REACHED, {
        limit: result.limit,
        used: result.used,
      });
    case "unknown_products":
      throw new ValidationError("Some products are not in the catalogue", ERROR_CODES.VALIDATION_FAILED, {
        field: "productIds",
        unknown: result.productIds,
      });
    case "main_product_required":
      throw new ValidationError("A landing channel sells exactly one main product", ERROR_CODES.VALIDATION_FAILED, {
        field: "productIds",
      });
    case "unknown_shipping_profile":
      throw new ValidationError("This shipping profile is not in the account", ERROR_CODES.VALIDATION_FAILED, {
        field: "defaultShippingProfileId",
      });
    case "unknown_template":
      throw new ValidationError("Unknown template for this channel type", ERROR_CODES.VALIDATION_FAILED, {
        field: "templateId",
      });
    case "invalid_domain":
      throw new ValidationError("This is not a domain name the channel can use", ERROR_CODES.INVALID_DOMAIN, { field: "customDomain" });
    case "domain_taken":
      throw new ConflictError("This domain is already used by another channel", ERROR_CODES.DOMAIN_TAKEN, { field: "customDomain" });
  }
}

export async function changeStatus(c: Context<AppContext>) {
  const { status } = (c.req as unknown as { valid(target: "json"): ChangeStoreStatusInput }).valid("json");
  const user = c.get("user");
  const storeId = c.req.param("id")!;
  const result = await changeStoreStatus(c.env.DATABASE.platform, {
    merchantId: user.merchantId,
    storeId,
    to: status,
    actor: { id: user.id, name: user.name ?? null, role: user.role },
  });
  if (result.ok) {
    schedulePurge(c.env, storeId);
    return c.json({ success: true, data: result.store }, 200);
  }
  if (result.reason === "not_found") throw new NotFoundError("Store", storeId);
  throw new BusinessLogicError(
    `A ${result.from} store cannot become ${status}`,
    ERROR_CODES.INVALID_STATUS_TRANSITION,
    { from: result.from, to: status },
  );
}

export async function statusHistory(c: Context<AppContext>) {
  const storeId = c.req.param("id")!;
  const data = await storeStatusHistory(c.env.DATABASE.platform, c.get("user").merchantId, storeId);
  if (!data) throw new NotFoundError("Store", storeId);
  return c.json({ success: true, data }, 200);
}

export async function deleteStore(c: Context<AppContext>) {
  const { confirmName } = (c.req as unknown as { valid(target: "json"): DeleteStoreInput }).valid("json");
  const storeId = c.req.param("id")!;
  const result = await deleteMerchantStore(c.env.DATABASE.platform, {
    merchantId: c.get("user").merchantId,
    storeId,
    confirmName,
  });
  if (result.ok) return c.json({ success: true }, 200);
  switch (result.reason) {
    case "not_found":
      throw new NotFoundError("Store", storeId);
    case "name_mismatch":
      throw new ValidationError("Type the store's name to confirm", ERROR_CODES.VALIDATION_FAILED, { field: "confirmName" });
    default:
      throw new BusinessLogicError("This store cannot be deleted", ERROR_CODES.STORE_NOT_DELETABLE, { reason: result.reason });
  }
}
