import { authClient, oauthRedirect } from "@/lib/auth/client";

export interface ChannelOption {
  id: string;
  name: string;
  type: string;
  status: string;
}

export async function getChannelChoice(): Promise<{ channels: ChannelOption[]; selected: string | null } | null> {
  const res = await fetch(`/mcp/channel-choice?oauth_query=${encodeURIComponent(window.location.search)}`, { credentials: "same-origin" });
  return res.ok ? res.json() : null;
}

export async function chooseChannel(storeId: string): Promise<boolean> {
  const res = await fetch("/mcp/channel-choice", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId, oauthQuery: window.location.search }),
  });
  return res.ok;
}

export async function continueAuthorization(): Promise<string | null> {
  const { data } = await authClient.$fetch("/oauth2/continue", { method: "POST", body: { postLogin: true } });
  return oauthRedirect(data);
}

export async function answerConsent(accept: boolean, scopes: string[]): Promise<string | null> {
  const { data } = await authClient.$fetch("/oauth2/consent", {
    method: "POST",
    body: accept ? { accept: true, scope: scopes.join(" ") } : { accept: false },
  });
  return oauthRedirect(data);
}

export async function publicClient(clientId: string): Promise<{ name: string; uri: string | null; logo: string | null } | null> {
  const { data } = await authClient.$fetch<{ client_name?: string; client_uri?: string; logo_uri?: string }>("/oauth2/public-client", {
    method: "GET",
    query: { client_id: clientId },
  });
  if (!data) return null;
  return { name: data.client_name ?? clientId, uri: data.client_uri ?? null, logo: data.logo_uri ?? null };
}
