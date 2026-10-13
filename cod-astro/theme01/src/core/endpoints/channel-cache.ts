import { timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";
import { STOREFRONT_SERVICE_KEY } from "astro:env/server";
import { channelTag } from "@/core/channel-cache";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ request, cache }) => {
  const key = request.headers.get("X-Storefront-Key") ?? "";
  if (!STOREFRONT_SERVICE_KEY || !sameSecret(key, STOREFRONT_SERVICE_KEY)) {
    return new Response(null, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { hostnames?: unknown } | null;
  const hostnames = Array.isArray(body?.hostnames)
    ? body.hostnames.filter((h): h is string => typeof h === "string" && h.length > 0)
    : [];
  if (hostnames.length === 0) return new Response(null, { status: 400 });
  await cache.invalidate({ tags: hostnames.map(channelTag) });
  return new Response(null, { status: 204 });
};
