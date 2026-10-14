import type { APIRoute } from "astro";
import { createAuth } from "@/lib/auth/server";
import { channelsOf, chooseChannel, chosenChannel } from "@/lib/auth/mcp-channel";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const GET: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first" }, 401);
  const [channels, selected] = await Promise.all([channelsOf(session.user.id), chosenChannel(session.session.id)]);
  return json({ channels, selected });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first" }, 401);
  const body = (await request.json().catch(() => null)) as { storeId?: unknown } | null;
  if (typeof body?.storeId !== "string" || !(await chooseChannel(session.session.id, session.user.id, body.storeId))) {
    return json({ error: "Unknown channel" }, 400);
  }
  return json({ ok: true });
};
