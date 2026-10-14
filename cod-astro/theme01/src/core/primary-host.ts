export function primaryRedirect(url: URL, host: string, forwardedProto: string | null, primary: string | null | undefined): string | null {
  const [name, port] = host.toLowerCase().split(":");
  if (!primary || name === primary) return null;
  const protocol = (forwardedProto?.split(",")[0].trim() || url.protocol.replace(":", "")) === "https" ? "https" : "http";
  const keepPort = port && !((protocol === "http" && port === "80") || (protocol === "https" && port === "443"));
  return `${protocol}://${primary}${keepPort ? `:${port}` : ""}${url.pathname}${url.search}`;
}
