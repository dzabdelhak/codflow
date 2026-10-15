import type { Context, Next } from "hono";
import type { AppContext } from "@/types";
import { AppError } from "@/lib/errors/classes";
import { ERROR_CATEGORIES, ERROR_CODES } from "../../../cod-shared/errors/codes";
import { CHANNEL_PRODUCT_FIELDS, isAventyMerchant } from "../../../cod-shared/aventy/merchant";

const PRODUCT = /^\/api\/products\/[^/]+$/;

export class CatalogueManagedByAventyError extends AppError {
  constructor() {
    super(
      "Products, variants, images, categories, prices and stock are managed in Aventy",
      ERROR_CODES.CATALOGUE_MANAGED_BY_AVENTY,
      ERROR_CATEGORIES.BUSINESS_LOGIC,
      403,
    );
  }
}

async function onlyChannelFields(c: Context<AppContext>): Promise<boolean> {
  const body = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    && Object.keys(body).every((key) => CHANNEL_PRODUCT_FIELDS.includes(key));
}

export async function aventyCatalogue(c: Context<AppContext>, next: Next) {
  if (c.req.method === "GET" || c.req.method === "HEAD" || !isAventyMerchant(c.get("user").merchantId)) return next();
  if (c.req.method === "PATCH" && PRODUCT.test(c.req.path) && (await onlyChannelFields(c))) return next();
  throw new CatalogueManagedByAventyError();
}
