import type { ChannelDomain } from "./api";

export type DomainProblem =
  | { key: "no_dns_records" | "dns_lookup_failed" | "platform_target_not_configured" }
  | { key: "points_elsewhere"; values: string };

export function domainProblem(domain: Pick<ChannelDomain, "status" | "lastError">): DomainProblem | null {
  if (domain.status !== "failed" || !domain.lastError) return null;
  const [key, values = ""] = domain.lastError.split(/:(.*)/s);
  if (key === "points_elsewhere") return { key, values };
  if (key === "no_dns_records" || key === "dns_lookup_failed" || key === "platform_target_not_configured") return { key };
  return { key: "dns_lookup_failed" };
}

function zoneOf(hostname: string): string {
  const labels = hostname.split(".");
  const secondLevel = labels.length >= 3 && /^(com|net|org|edu|gov|co|ac)$/.test(labels.at(-2)!) && labels.at(-1)!.length === 2;
  return labels.slice(secondLevel ? -3 : -2).join(".");
}

export function isRootDomain(hostname: string): boolean {
  return zoneOf(hostname) === hostname;
}

export function recordName(hostname: string): string {
  const zone = zoneOf(hostname);
  return zone === hostname ? "@" : hostname.slice(0, -(zone.length + 1));
}
