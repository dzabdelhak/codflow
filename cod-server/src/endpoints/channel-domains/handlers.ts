import type { Context } from "hono";
import type { AppContext } from "@/types";
import { BusinessLogicError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors/classes";
import { ACTIONS, logActivity } from "@/lib/activity";
import { schedulePurge } from "@/platform/storefront-cache";
import {
  addChannelDomain,
  certificateAllowed,
  domainTargets,
  listChannelDomains,
  MAX_DOMAINS_PER_CHANNEL,
  removeChannelDomain,
  setPrimaryDomain,
  verifyChannelDomain,
  type ChannelDomain,
} from "@/platform/channel-domains";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import type { AddDomainInput } from "./validation";

function body<T>(c: Context<AppContext>): T {
  return (c.req as unknown as { valid(target: "json"): T }).valid("json");
}

const storeOf = (c: Context<AppContext>) => c.get("storeId")!;
const audit = (c: Context<AppContext>, action: (typeof ACTIONS)[keyof typeof ACTIONS], hostname: string, metadata?: Record<string, unknown>) =>
  logActivity(c.get("db"), c.get("user"), action, { type: "domain", id: hostname, label: hostname }, metadata);

async function withCertificates(c: Context<AppContext>, domains: ChannelDomain[]) {
  return Promise.all(
    domains.map(async (domain) => ({
      ...domain,
      certificate: domain.kind === "custom" && domain.status === "verified" ? await c.env.CERT_PROBE(domain.hostname) : null,
    })),
  );
}

async function state(c: Context<AppContext>, status: 200 | 201 = 200) {
  const domains = await listChannelDomains(c.env.DATABASE.platform, storeOf(c));
  const targets = domainTargets(c.env);
  return c.json({ success: true, data: { domains: await withCertificates(c, domains), dns: targets } }, status);
}

export const list = (c: Context<AppContext>) => state(c);

export async function add(c: Context<AppContext>) {
  const { hostname } = body<AddDomainInput>(c);
  const result = await addChannelDomain(c.env.DATABASE.platform, storeOf(c), hostname, c.env.STORE_BASE_DOMAIN ?? "localhost");
  if (!result.ok) {
    switch (result.reason) {
      case "invalid":
        throw new ValidationError("Enter a domain such as shop.example.com", ERROR_CODES.INVALID_DOMAIN, { field: "hostname" });
      case "already_added":
        throw new ConflictError("This domain is already on this channel", ERROR_CODES.DOMAIN_ALREADY_ADDED, { field: "hostname" });
      case "taken":
        throw new ConflictError("This domain is used by another channel", ERROR_CODES.DOMAIN_TAKEN, { field: "hostname" });
      case "limit":
        throw new BusinessLogicError("This channel has the maximum number of domains", ERROR_CODES.DOMAIN_LIMIT_REACHED, {
          limit: MAX_DOMAINS_PER_CHANNEL,
        });
    }
  }
  await audit(c, ACTIONS.DOMAIN_ADDED, result.domain.hostname);
  return state(c, 201);
}

export async function verify(c: Context<AppContext>) {
  const hostname = c.req.param("hostname")!;
  const result = await verifyChannelDomain(c.env.DATABASE.platform, storeOf(c), hostname, c.env.DOMAIN_DNS, domainTargets(c.env));
  if (!result.ok) throw new NotFoundError("Domain", hostname);
  if (result.domain.kind === "custom") {
    await audit(c, result.domain.status === "verified" ? ACTIONS.DOMAIN_VERIFIED : ACTIONS.DOMAIN_VERIFICATION_FAILED, hostname, {
      error: result.domain.lastError,
    });
  }
  return state(c);
}

export async function makePrimary(c: Context<AppContext>) {
  const hostname = c.req.param("hostname")!;
  const result = await setPrimaryDomain(c.env.DATABASE.platform, storeOf(c), hostname);
  if (!result.ok) {
    if (result.reason === "not_found") throw new NotFoundError("Domain", hostname);
    throw new ConflictError("Only a verified domain can be the primary domain", ERROR_CODES.DOMAIN_NOT_VERIFIED, { hostname });
  }
  await audit(c, ACTIONS.DOMAIN_PRIMARY_SET, hostname);
  schedulePurge(c.env, storeOf(c));
  return state(c);
}

export async function remove(c: Context<AppContext>) {
  const hostname = c.req.param("hostname")!;
  const result = await removeChannelDomain(c.env.DATABASE.platform, storeOf(c), hostname);
  if (!result.ok) {
    if (result.reason === "not_found") throw new NotFoundError("Domain", hostname);
    throw new ConflictError(
      result.reason === "is_primary" ? "Choose another primary domain before removing this one" : "The channel's free address cannot be removed",
      ERROR_CODES.DOMAIN_NOT_REMOVABLE,
      { reason: result.reason },
    );
  }
  await audit(c, ACTIONS.DOMAIN_REMOVED, hostname);
  return state(c);
}

export async function tlsAsk(c: Context<AppContext>) {
  const domain = c.req.query("domain") ?? "";
  return (await certificateAllowed(c.env.DATABASE.platform, domain)) ? c.text("ok", 200) : c.text("unknown domain", 404);
}
