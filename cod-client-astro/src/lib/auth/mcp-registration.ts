const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isHttpLoopback(uri: unknown): boolean {
  if (typeof uri !== "string") return false;
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function registrationWithApplicationType<T extends { application_type?: unknown; redirect_uris?: unknown }>(body: T): T {
  if (body.application_type !== undefined) return body;
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  return uris.length > 0 && uris.every(isHttpLoopback) ? { ...body, application_type: "native" } : body;
}
