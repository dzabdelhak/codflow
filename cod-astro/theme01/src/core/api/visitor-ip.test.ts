// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("astro:env/server", () => ({ TRUSTED_PROXY_IP_HEADER: undefined }));

import { resolveVisitorIp } from "./visitor-ip";

const request = (headers: Record<string, string>) => new Request("http://shop.test/", { headers });

describe("the visitor's IP", () => {
  it("is the address the front proxy saw, never what X-Forwarded-For claims", () => {
    const forged = request({ "X-Forwarded-For": "6.6.6.6", "X-Visitor-IP": "41.100.1.2" });
    expect(resolveVisitorIp(forged, "172.18.0.5", "x-visitor-ip")).toBe("41.100.1.2");
  });

  it("is the connection's own address when no front proxy is configured", () => {
    expect(resolveVisitorIp(request({ "X-Forwarded-For": "6.6.6.6", "X-Visitor-IP": "6.6.6.7" }), "41.100.1.2", undefined)).toBe("41.100.1.2");
  });

  it("is nothing rather than something that is not an address", () => {
    expect(resolveVisitorIp(request({ "X-Visitor-IP": "not-an-ip" }), undefined, "x-visitor-ip")).toBeNull();
  });
});
