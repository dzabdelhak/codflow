import type { Context } from "hono";
import type { AppContext } from "@/types";
import { ConflictError, ValidationError } from "@/lib/errors/classes";
import { schedulePurge } from "@/platform/storefront-cache";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { getLandingChannel, replaceMainProduct, setUnavailableRule } from "../../../../cod-shared/queries/landing-channel";
import type { MainProductInput, RuleInput } from "./validation";

function body<T>(c: Context<AppContext>): T {
  return (c.req as unknown as { valid(target: "json"): T }).valid("json");
}

function notLanding(): never {
  throw new ConflictError("This store is not a landing channel", ERROR_CODES.NOT_A_LANDING_CHANNEL);
}

export async function get(c: Context<AppContext>) {
  const landing = (await getLandingChannel(c.get("db"), c.get("storeId")!)) ?? notLanding();
  return c.json({ success: true, data: landing }, 200);
}

export async function replace(c: Context<AppContext>) {
  const { productId } = body<MainProductInput>(c);
  const result = await replaceMainProduct(c.get("db"), c.get("storeId")!, productId);
  if (!result.ok) {
    if (result.reason === "not_landing") notLanding();
    if (result.reason === "unsellable_product") {
      throw new ValidationError("This product is archived, draft or hidden", ERROR_CODES.VALIDATION_FAILED, {
        field: "productId",
        reason: "unsellable",
      });
    }
    throw new ValidationError("This product is not in the catalogue", ERROR_CODES.VALIDATION_FAILED, { field: "productId" });
  }
  schedulePurge(c.env, c.get("storeId"));
  return c.json({ success: true, data: result.landing }, 200);
}

export async function updateRule(c: Context<AppContext>) {
  const { unavailableRule } = body<RuleInput>(c);
  const landing = (await setUnavailableRule(c.get("db"), c.get("storeId")!, unavailableRule)) ?? notLanding();
  schedulePurge(c.env, c.get("storeId"));
  return c.json({ success: true, data: landing }, 200);
}
