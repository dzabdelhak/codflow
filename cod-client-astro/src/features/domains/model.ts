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

export function isRootDomain(hostname: string): boolean {
  const labels = hostname.split(".");
  if (labels.length <= 2) return true;
  return labels.length === 3 && /^(com|net|org|edu|gov|co|ac)$/.test(labels[1]) && labels[2].length === 2;
}
