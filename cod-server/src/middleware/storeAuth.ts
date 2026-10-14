/**
 * Storefront channel resolution.
 *
 * One storefront deployment serves every channel. It authenticates as the
 * storefront with `X-Storefront-Key` (shared secret, server-to-server only)
 * and names the visitor's hostname in `X-Channel-Host`; the hostname picks the
 * channel. The hostname is trusted only together with the key, so a browser
 * calling the API directly cannot choose a store.
 */
import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import type { AppContext } from "@/types";
import { requestScope, scopeForHost, type Scope } from "@/db/scope";
import { channelPublicAccess } from "../../../cod-shared/channels/lifecycle";
import { ERROR_CODES } from "../../../cod-shared/errors/codes";
import { previewTokenStore } from "@/platform/design-preview";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function resolveStorefrontStore(c: Context<AppContext>): Promise<Scope | Response> {
  const expected = c.env.STOREFRONT_SERVICE_KEY;
  const key = c.req.header("X-Storefront-Key");
  if (!expected || !key || !sameSecret(key, expected)) {
    return c.json({ error: "Invalid storefront key" }, 401);
  }
  const host = c.req.header("X-Channel-Host");
  if (!host) return c.json({ error: "Missing channel host" }, 400);

  const scope = await scopeForHost(c.env.DATABASE.platform, host);
  const previewToken = c.req.header("X-Preview-Token");
  if (scope && previewToken && c.req.method === "GET" && previewTokenStore(previewToken, expected) === scope.storeId) {
    c.set("designPreview", true);
    return { storeId: scope.storeId, merchantId: scope.merchantId };
  }
  const access = scope ? channelPublicAccess(scope.channel) : "hidden";
  if (access === "hidden") return c.json({ error: "Unknown store" }, 404);
  if (access === "unavailable") {
    return c.json({ error: "This store is unavailable", code: ERROR_CODES.CHANNEL_UNAVAILABLE }, 503);
  }
  return { storeId: scope!.storeId, merchantId: scope!.merchantId };
}

export const storeAuthMiddleware = requestScope(resolveStorefrontStore);
