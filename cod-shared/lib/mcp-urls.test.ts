import { describe, expect, it } from "vitest";
import { authorizationServerIssuer, authServerOrigin, mcpResourceUrl } from "./mcp-urls";

describe("MCP URLs", () => {
  it("names the MCP resource and the authorization server the same way on both sides", () => {
    expect(mcpResourceUrl("https://api.example.com")).toBe("https://api.example.com/mcp");
    expect(mcpResourceUrl("https://api.example.com/")).toBe("https://api.example.com/mcp");
    expect(authorizationServerIssuer("https://app.example.com/")).toBe("https://app.example.com/api/auth");
    expect(authorizationServerIssuer("https://app.example.com/api/auth")).toBe("https://app.example.com/api/auth");
    expect(authServerOrigin("https://app.example.com/api/auth/")).toBe("https://app.example.com");
  });
});
