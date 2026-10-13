import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { APIRoute } from "astro";

export const prerender = false;

/**
 * SPA fallback: detail pages (/orders/<id>, /products/<id>/edit, …) are not
 * prerendered; the client shell routes them. Any page URL no prerendered file
 * matches gets that shell. Requests for anything other than a page still 404.
 */
let shell: Promise<string> | undefined;

export const GET: APIRoute = async (ctx) => {
  const wantsPage = (ctx.request.headers.get("accept") ?? "").includes("text/html");
  if (!wantsPage || ctx.url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
  if (import.meta.env.DEV) return ctx.rewrite("/");

  shell ??= readFile(resolve(process.env.DASHBOARD_CLIENT_DIR ?? "dist/client", "index.html"), "utf8");
  return new Response(await shell, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};
