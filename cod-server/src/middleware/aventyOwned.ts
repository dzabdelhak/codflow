import type { Context, MiddlewareHandler } from "hono";
import type { AppContext } from "@/types";
import { AppError } from "@/lib/errors/classes";
import { ERROR_CATEGORIES, ERROR_CODES, type ErrorCode } from "../../../cod-shared/errors/codes";
import { CHANNEL_PRODUCT_FIELDS, isAventyMerchant } from "../../../cod-shared/aventy/merchant";

type Exception = (c: Context<AppContext>) => boolean | Promise<boolean>;

export class ManagedByAventyError extends AppError {
  constructor(message: string, code: ErrorCode) {
    super(message, code, ERROR_CATEGORIES.BUSINESS_LOGIC, 403);
  }
}

function aventyReadOnly(message: string, code: ErrorCode, exception?: Exception): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD" || !isAventyMerchant(c.get("user").merchantId)) return next();
    if (exception && (await exception(c))) return next();
    throw new ManagedByAventyError(message, code);
  };
}

const PRODUCT = /^\/api\/products\/[^/]+$/;

async function onlyChannelFields(c: Context<AppContext>): Promise<boolean> {
  if (c.req.method !== "PATCH" || !PRODUCT.test(c.req.path)) return false;
  const body = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    && Object.keys(body).every((key) => CHANNEL_PRODUCT_FIELDS.includes(key));
}

export const aventyCatalogue = aventyReadOnly(
  "Products, variants, images, categories, prices and stock are managed in Aventy",
  ERROR_CODES.CATALOGUE_MANAGED_BY_AVENTY,
  onlyChannelFields,
);

export const aventyDelivery = aventyReadOnly("The delivery grid is managed in Aventy", ERROR_CODES.DELIVERY_MANAGED_BY_AVENTY);

export const aventyTeam = aventyReadOnly(
  "The team is managed in Aventy",
  ERROR_CODES.TEAM_MANAGED_BY_AVENTY,
  (c) => /^\/api\/users\/[^/]+\/api-key\/rotate$/.test(c.req.path),
);
