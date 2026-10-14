export function authorizationKey(query: string | URLSearchParams | null | undefined): string | null {
  if (query === null || query === undefined) return null;
  const params = typeof query === "string" ? new URLSearchParams(query.startsWith("?") ? query.slice(1) : query) : query;
  const clientId = params.get("client_id");
  const attempt = params.get("code_challenge") ?? params.get("state");
  return clientId && attempt ? `${clientId}:${attempt}` : null;
}

export async function authorizationKeyOf(request: Request): Promise<string | null> {
  const fromUrl = authorizationKey(new URL(request.url).searchParams);
  if (fromUrl || request.method !== "POST" || !request.headers.get("content-type")?.includes("application/json")) return fromUrl;
  const body = (await request.clone().json().catch(() => null)) as { oauth_query?: unknown } | null;
  return typeof body?.oauth_query === "string" ? authorizationKey(body.oauth_query) : null;
}
