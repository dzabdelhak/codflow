import { describe, expect, it } from "vitest";
import { authorizationKey, authorizationKeyOf } from "./mcp-authorization";

describe("MCP authorization key", () => {
  it("names one authorization by its client and PKCE challenge, or its state", () => {
    expect(authorizationKey("?client_id=c1&code_challenge=abc&state=s&sig=x")).toBe("c1:abc");
    expect(authorizationKey("client_id=c1&state=s")).toBe("c1:s");
    expect(authorizationKey("client_id=c1")).toBeNull();
    expect(authorizationKey(null)).toBeNull();
  });

  it("reads it from the authorize URL or from the signed query a POST carries", async () => {
    expect(await authorizationKeyOf(new Request("http://app.test/api/auth/oauth2/authorize?client_id=c1&code_challenge=abc"))).toBe("c1:abc");
    const consent = new Request("http://app.test/api/auth/oauth2/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept: true, oauth_query: "client_id=c2&code_challenge=def&sig=x" }),
    });
    expect(await authorizationKeyOf(consent)).toBe("c2:def");
    expect(await consent.json()).toMatchObject({ accept: true });
    expect(await authorizationKeyOf(new Request("http://app.test/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))).toBeNull();
  });
});
