// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CORE ENGINE — DO NOT MODIFY                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { isIP } from "node:net";
import { TRUSTED_PROXY_IP_HEADER } from "astro:env/server";

export const VISITOR_IP_HEADER = "X-Visitor-IP";

export function resolveVisitorIp(request: Request, clientAddress: string | undefined, trustedHeader: string | undefined): string | null {
  const candidate = trustedHeader ? request.headers.get(trustedHeader)?.trim() : clientAddress;
  return candidate && isIP(candidate) ? candidate : null;
}

export function visitorIpHeaders(request: Request, clientAddress: () => string | undefined): Record<string, string> {
  let address: string | undefined;
  if (!TRUSTED_PROXY_IP_HEADER) {
    try {
      address = clientAddress();
    } catch {
      address = undefined;
    }
  }
  const ip = resolveVisitorIp(request, address, TRUSTED_PROXY_IP_HEADER);
  return ip ? { [VISITOR_IP_HEADER]: ip } : {};
}
