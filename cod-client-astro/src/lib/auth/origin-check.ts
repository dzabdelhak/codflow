const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const FORM_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
const OAUTH_CLIENT_ENDPOINTS = new Set(["/api/auth/oauth2/token", "/api/auth/oauth2/revoke", "/api/auth/oauth2/introspect"]);

export function isForbiddenCrossSiteRequest(request: Request, url: URL): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  if (OAUTH_CLIENT_ENDPOINTS.has(url.pathname)) return false;
  if (request.headers.get("origin") === url.origin) return false;
  const contentType = request.headers.get("content-type");
  if (contentType === null) return true;
  return FORM_TYPES.some((type) => contentType.toLowerCase().includes(type));
}
