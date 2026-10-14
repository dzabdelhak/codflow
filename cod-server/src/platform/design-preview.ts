import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 60 * 60 * 1000;

function mac(storeId: string, expires: number, key: string): string {
  return createHmac("sha256", key).update(`design-preview:${storeId}:${expires}`).digest("base64url");
}

export function signPreviewToken(storeId: string, key: string, now = Date.now()): { token: string; expiresAt: string } {
  const expires = now + TTL_MS;
  const token = Buffer.from(`${storeId}:${expires}:${mac(storeId, expires, key)}`).toString("base64url");
  return { token, expiresAt: new Date(expires).toISOString() };
}

export function previewTokenStore(token: string, key: string, now = Date.now()): string | null {
  const parts = Buffer.from(token, "base64url").toString("utf8").split(":");
  if (parts.length !== 3) return null;
  const [storeId, rawExpires, given] = parts;
  const expires = Number(rawExpires);
  if (!storeId || !Number.isFinite(expires) || expires < now) return null;
  const expected = Buffer.from(mac(storeId, expires, key));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? storeId : null;
}
