import { createHmac, timingSafeEqual } from "node:crypto";

export interface AventyLinkClaims {
  ref: string;
  shop: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
  jti: string;
}

export type LinkTokenResult = { ok: true; claims: AventyLinkClaims } | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "too_long" };

export const LINK_TOKEN_MAX_LIFETIME = 300;
const CLOCK_SKEW = 60;
const REF = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signLinkToken(secret: string, claims: AventyLinkClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

function claimsOf(raw: unknown): AventyLinkClaims | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (typeof c.ref !== "string" || !REF.test(c.ref)) return null;
  if (!text(c.shop, 120) || !text(c.name, 120) || !text(c.jti, 128)) return null;
  if (typeof c.email !== "string" || c.email.length > 254 || !EMAIL.test(c.email)) return null;
  if (!Number.isInteger(c.iat) || !Number.isInteger(c.exp)) return null;
  return {
    ref: c.ref,
    shop: (c.shop as string).trim(),
    email: c.email.trim().toLowerCase(),
    name: (c.name as string).trim(),
    iat: c.iat as number,
    exp: c.exp as number,
    jti: c.jti as string,
  };
}

export function verifyLinkToken(secret: string, token: string, nowSeconds = Math.floor(Date.now() / 1000)): LinkTokenResult {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return { ok: false, reason: "malformed" };
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };
  let claims: AventyLinkClaims | null;
  try {
    claims = claimsOf(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    claims = null;
  }
  if (!claims) return { ok: false, reason: "malformed" };
  if (claims.exp - claims.iat > LINK_TOKEN_MAX_LIFETIME) return { ok: false, reason: "too_long" };
  if (claims.exp < nowSeconds || claims.iat > nowSeconds + CLOCK_SKEW) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

export const aventyMerchantId = (ref: string) => `aventy-${ref}`;
