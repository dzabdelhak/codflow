import { describe, expect, it } from "vitest";
import { signLinkToken, verifyLinkToken, type AventyLinkClaims } from "./link-token";

const secret = "s".repeat(32);
const now = 1_800_000_000;
const claims = (overrides: Partial<AventyLinkClaims> = {}): AventyLinkClaims => ({
  ref: "shop-42", shop: "Maison Lina", email: "Lina@Example.com", name: "Lina", iat: now, exp: now + 120, jti: "j-1", ...overrides,
});

describe("Aventy's signed link", () => {
  it("opens with the shared secret and normalises the email", () => {
    const result = verifyLinkToken(secret, signLinkToken(secret, claims()), now + 10);
    expect(result).toEqual({ ok: true, claims: { ...claims(), email: "lina@example.com" } });
  });

  it("refuses another secret, a changed body and a malformed token", () => {
    const token = signLinkToken(secret, claims());
    expect(verifyLinkToken("other".repeat(8), token, now)).toEqual({ ok: false, reason: "bad_signature" });
    const [, signature] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify(claims({ ref: "someone-else" }))).toString("base64url")}.${signature}`;
    expect(verifyLinkToken(secret, forged, now)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyLinkToken(secret, "garbage", now)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyLinkToken(secret, signLinkToken(secret, claims({ ref: "../x" })), now)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses an expired link and one valid for more than five minutes", () => {
    expect(verifyLinkToken(secret, signLinkToken(secret, claims()), now + 121)).toEqual({ ok: false, reason: "expired" });
    expect(verifyLinkToken(secret, signLinkToken(secret, claims({ exp: now + 3600 })), now)).toEqual({ ok: false, reason: "too_long" });
  });
});
