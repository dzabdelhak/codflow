/**
 * Dashboard request scope. Runs after authMiddleware: the user's merchant is
 * known, and the active store comes from `X-Store-Id` — accepted only when
 * that merchant owns it. Without the header, the merchant's first store.
 */
import type { Context } from "hono";
import type { AppContext } from "@/types";
import { requestScope, type Scope } from "@/db/scope";
import { ERROR_CODES } from "../../../cod-shared/errors/codes";
import { firstStoreId, merchantOwnsStore } from "@/platform/merchant-stores";

export async function resolveDashboardScope(c: Context<AppContext>): Promise<Scope | Response> {
  const { merchantId } = c.get("user");
  const platform = c.env.DATABASE.platform;
  const requested = c.req.header("X-Store-Id");

  if (requested) {
    if (!(await merchantOwnsStore(platform, merchantId, requested))) {
      return c.json({ error: "This store is not one of yours", code: ERROR_CODES.STORE_NOT_OWNED, category: "AUTHENTICATION" }, 403);
    }
    return { merchantId, storeId: requested };
  }
  return { merchantId, storeId: await firstStoreId(platform, merchantId) };
}

export const dashboardScope = requestScope(resolveDashboardScope);
