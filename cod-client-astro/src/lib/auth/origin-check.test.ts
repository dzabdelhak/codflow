import { describe, expect, it } from "vitest";
import { isForbiddenCrossSiteRequest } from "./origin-check";

const check = (path: string, init: RequestInit) => {
  const url = new URL(`http://app.test${path}`);
  return isForbiddenCrossSiteRequest(new Request(url, init), url);
};
const form = { "Content-Type": "application/x-www-form-urlencoded" };

describe("cross-site request check", () => {
  it("refuses a cross-site form post, as Astro's own check does", () => {
    expect(check("/api/auth/sign-in/email", { method: "POST", headers: form, body: "a=1" })).toBe(true);
    expect(check("/mcp/channel-choice", { method: "POST" })).toBe(true);
    expect(check("/api/auth/sign-in/email", { method: "POST", headers: { ...form, Origin: "http://evil.test" }, body: "a=1" })).toBe(true);
  });

  it("lets same-origin posts, JSON and reads through", () => {
    expect(check("/api/auth/sign-in/email", { method: "POST", headers: { ...form, Origin: "http://app.test" }, body: "a=1" })).toBe(false);
    expect(check("/api/auth/oauth2/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).toBe(false);
    expect(check("/api/auth/oauth2/authorize", { method: "GET" })).toBe(false);
  });

  it("lets OAuth clients reach the token, revocation and introspection endpoints from their servers", () => {
    for (const path of ["/api/auth/oauth2/token", "/api/auth/oauth2/revoke", "/api/auth/oauth2/introspect"]) {
      expect(check(path, { method: "POST", headers: form, body: "grant_type=authorization_code" })).toBe(false);
    }
  });
});
