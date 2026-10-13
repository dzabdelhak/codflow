import type { Context } from "hono";
import type { AppContext } from "@/types";
import { BusinessLogicError, ConflictError, ValidationError } from "@/lib/errors/classes";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { createMerchantStore, listMerchantStores } from "@/platform/merchant-stores";
import { localPlanPolicy } from "@/platform/plan-policy";
import type { CreateStoreInput } from "./validation";

export async function listStores(c: Context<AppContext>) {
  const data = await listMerchantStores(c.env.DATABASE.platform, c.get("user").merchantId);
  return c.json({ success: true, data }, 200);
}

export async function createStore(c: Context<AppContext>) {
  const body = (c.req as unknown as { valid(target: "json"): CreateStoreInput }).valid("json");
  const result = await createMerchantStore(
    c.env.DATABASE.platform,
    {
      merchantId: c.get("user").merchantId,
      name: body.name,
      subdomain: body.subdomain,
      baseDomain: c.env.STORE_BASE_DOMAIN ?? "localhost",
    },
    localPlanPolicy(),
  );
  if (result.ok) return c.json({ success: true, data: result.store }, 201);

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
  }
}
