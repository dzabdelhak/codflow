import type { APIRoute } from "astro";
import { createAuth } from "@/lib/auth/server";

export const prerender = false;

const ALL: APIRoute = (ctx) => createAuth().handler(ctx.request);

export const GET = ALL;
export const POST = ALL;
