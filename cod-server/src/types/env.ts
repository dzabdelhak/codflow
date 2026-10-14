/**
 * Server environment, built from process.env by the Node entry (src/node.ts).
 */
import type { Database } from "@/db/scope";
import type { ImageStore } from "@/platform/image-store";
import type { DnsLookup } from "@/platform/channel-domains";
import type { CertificateStatus } from "@/platform/tls-probe";
import type { AventyKeyVault } from "@/aventy/key-vault";

export interface Env {
  /** PostgreSQL pools (app: RLS-confined, platform: cross-store). */
  DATABASE: Database;
  /**
   * Shared secret the storefront sends as `X-Storefront-Key`; without it the
   * API ignores `X-Channel-Host`. Server-to-server only, never in a browser.
   */
  STOREFRONT_SERVICE_KEY?: string;
  /** Free subdomains are `<subdomain>.<STORE_BASE_DOMAIN>` (default "localhost"). */
  STORE_BASE_DOMAIN?: string;
  ORDER_IP_CEILING_PER_HOUR?: string;
  ORDER_DESTINATION?: string;
  OUTBOUND_TEST_FAILURE_RATE?: string;
  STOREFRONT_INTERNAL_URL?: string;
  /** Image storage (MinIO / S3-compatible), built by src/node.ts from the S3_* variables. */
  IMAGE_STORE: ImageStore;
  /** Public base of the image service, e.g. "https://api.example.com/images"; defaults to the request origin + "/images". */
  IMAGES_PUBLIC_URL?: string;
  /** Hostname merchants point a custom domain's CNAME at (e.g. "stores.codflow.app"). */
  CUSTOM_DOMAIN_TARGET?: string;
  /** Comma-separated IPv4 addresses an apex custom domain's A records point at. */
  CUSTOM_DOMAIN_IPV4?: string;
  /** Where channel certificates are probed (Caddy); defaults to CUSTOM_DOMAIN_TARGET / CUSTOM_DOMAIN_IPV4. */
  TLS_PROBE_HOST?: string;
  /** DNS lookups for domain verification, built by src/node.ts (DNS_SERVERS optional). */
  DOMAIN_DNS: DnsLookup;
  /** Reads the HTTPS certificate a domain is served with, built by src/node.ts (TLS_PROBE_HOST/PORT optional). */
  CERT_PROBE: (hostname: string) => Promise<CertificateStatus>;
  /** Seals channels' Aventy keys; built by src/node.ts from AVENTY_KEY_ENCRYPTION_KEY (null when unset). */
  AVENTY_KEY_VAULT: AventyKeyVault | null;
  /** Deployment environment: "development" | "production" */
  ENVIRONMENT: string;
  /** Comma-separated list of allowed CORS origins (e.g., "http://localhost:3000,https://app.example.com") */
  ALLOWED_ORIGINS?: string;
  /**
   * Optional storefront fallback origin (e.g., "https://store.example.com").
   * Landing page share URLs prefer the store's own domain (stores.domain,
   * set by the merchant in Store Settings); this var is the fallback for
   * deployments without a custom domain yet.
   */
  STOREFRONT_URL?: string;

  /**
   * Origin of the dashboard, the OAuth authorization server. MCP access tokens
   * must carry `iss` = `${BETTER_AUTH_URL}/api/auth`; the JWKS defaults to
   * `${BETTER_AUTH_URL}/api/auth/jwks`.
   */
  BETTER_AUTH_URL: string;
  /** JWKS endpoint as reachable from this server; defaults to `${BETTER_AUTH_URL}/api/auth/jwks`. */
  BETTER_AUTH_JWKS_URL?: string;
  /**
   * This API's public origin, e.g. "https://api.example.dz": the OpenAPI
   * server, webhook URLs, image URLs, and the MCP token audience
   * (`${PUBLIC_API_URL}/mcp`).
   */
  PUBLIC_API_URL: string;
  /** Redis for rate limits (MCP, storefront OTP) and MCP last-used times; everything still serves without it. */
  REDIS_URL?: string;
}
