const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "");

export function mcpResourceUrl(apiBase: string): string {
  return `${withoutTrailingSlash(apiBase)}/mcp`;
}

export function authServerOrigin(appBase: string): string {
  return withoutTrailingSlash(appBase).replace(/\/api\/auth$/, "");
}

export function authorizationServerIssuer(appBase: string): string {
  return `${authServerOrigin(appBase)}/api/auth`;
}
