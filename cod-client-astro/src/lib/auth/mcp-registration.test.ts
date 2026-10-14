import { describe, expect, it } from "vitest";
import { registrationWithApplicationType } from "./mcp-registration";

describe("MCP client registration", () => {
  it("registers a client that only redirects to this machine as a native app", () => {
    expect(registrationWithApplicationType({ redirect_uris: ["http://localhost:6274/callback", "http://127.0.0.1:33418/cb"] })).toMatchObject({ application_type: "native" });
  });

  it("leaves web clients and an explicit type alone", () => {
    expect(registrationWithApplicationType({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] })).not.toHaveProperty("application_type");
    expect(registrationWithApplicationType({ redirect_uris: ["http://localhost:6274/cb", "https://app.example/cb"] })).not.toHaveProperty("application_type");
    expect(registrationWithApplicationType({ redirect_uris: ["http://localhost:6274/cb"], application_type: "web" })).toMatchObject({ application_type: "web" });
    expect(registrationWithApplicationType({})).not.toHaveProperty("application_type");
  });
});
