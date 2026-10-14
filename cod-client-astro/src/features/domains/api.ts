import { apiFetch } from "@/lib/api";

export type DomainStatus = "pending" | "verified" | "failed";

export type CertificateStatus =
  | { status: "active"; trusted: boolean; issuer: string | null; validTo: string }
  | { status: "missing" }
  | { status: "error"; message: string };

export interface ChannelDomain {
  hostname: string;
  kind: "subdomain" | "custom";
  status: DomainStatus;
  isPrimary: boolean;
  createdAt: string;
  verifiedAt: string | null;
  checkedAt: string | null;
  lastError: string | null;
  certificate: CertificateStatus | null;
}

export interface DomainsState {
  domains: ChannelDomain[];
  dns: { cname: string | null; ipv4: string[] };
}

interface DataEnvelope<T> {
  success: boolean;
  data: T;
}

const path = (hostname: string, suffix = "") => `/api/channel-domains/${encodeURIComponent(hostname)}${suffix}`;

export async function getDomains(): Promise<DomainsState> {
  return (await apiFetch<DataEnvelope<DomainsState>>("/api/channel-domains")).data;
}

export async function addDomain(hostname: string): Promise<DomainsState> {
  return (
    await apiFetch<DataEnvelope<DomainsState>>("/api/channel-domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname }),
    })
  ).data;
}

export async function verifyDomain(hostname: string): Promise<DomainsState> {
  return (await apiFetch<DataEnvelope<DomainsState>>(path(hostname, "/verify"), { method: "POST" })).data;
}

export async function makePrimaryDomain(hostname: string): Promise<DomainsState> {
  return (await apiFetch<DataEnvelope<DomainsState>>(path(hostname, "/primary"), { method: "POST" })).data;
}

export async function removeDomain(hostname: string): Promise<DomainsState> {
  return (await apiFetch<DataEnvelope<DomainsState>>(path(hostname), { method: "DELETE" })).data;
}
