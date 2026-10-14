import type { APIRoute } from "astro";
import { createAuth } from "@/lib/auth/server";
import { channelsOf, chooseChannel, chosenChannel } from "@/lib/auth/mcp-channel";
import { authorizationKey } from "@/lib/auth/mcp-authorization";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const GET: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first" }, 401);
  const authorization = authorizationKey(new URL(request.url).searchParams.get("oauth_query"));
  const [channels, selected] = await Promise.all([channelsOf(session.user.id), chosenChannel(session.session.id, authorization)]);
  return json({ channels, selected });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first" }, 401);
  const body = (await request.json().catch(() => null)) as { storeId?: unknown; oauthQuery?: unknown } | null;
  const authorization = authorizationKey(typeof body?.oauthQuery === "string" ? body.oauthQuery : null);
  if (!authorization) return json({ error: "No authorization in progress" }, 400);
  if (typeof body?.storeId !== "string" || !(await chooseChannel(session.session.id, authorization, session.user.id, body.storeId))) {
    return json({ error: "Unknown channel" }, 400);
  }
  return json({ ok: true });
};
