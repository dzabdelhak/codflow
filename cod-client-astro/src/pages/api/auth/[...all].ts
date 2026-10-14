import type { APIRoute } from "astro";
import { createAuth } from "@/lib/auth/server";
import { withAuthorization } from "@/lib/auth/mcp-channel";
import { authorizationKeyOf } from "@/lib/auth/mcp-authorization";

export const prerender = false;

const ALL: APIRoute = async (ctx) =>
  withAuthorization(await authorizationKeyOf(ctx.request), () => createAuth().handler(ctx.request));

export const GET = ALL;
export const POST = ALL;
