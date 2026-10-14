// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const request = new Request("http://shop.test/", { headers: { "X-Forwarded-For": "6.6.6.6", "X-Visitor-IP": "41.100.1.2" } });

async function headersWith(trusted: string | undefined) {
  vi.resetModules();
  vi.doMock("astro:env/server", () => ({ TRUSTED_PROXY_IP_HEADER: trusted }));
  const { visitorIpHeaders } = await import("./visitor-ip");
  return visitorIpHeaders(request, () => "172.18.0.5");
}

afterEach(() => vi.doUnmock("astro:env/server"));

describe("what the storefront tells cod-server about the visitor", () => {
  it("is the front proxy's header when one is trusted", async () => {
    expect(await headersWith("x-visitor-ip")).toEqual({ "X-Visitor-IP": "41.100.1.2" });
  });

  it("is the connection's address otherwise, never a header the visitor wrote", async () => {
    expect(await headersWith(undefined)).toEqual({ "X-Visitor-IP": "172.18.0.5" });
  });

  it("goes out from every proxy that reaches cod-server for a visitor, and X-Forwarded-For never does", () => {
    for (const path of ["../actions/index.ts", "../endpoints/abandoned.ts", "../endpoints/otp-send.ts"]) {
      const source = readFileSync(resolve(__dirname, path), "utf8");
      expect(source, path).toMatch(/visitorIpHeaders\(/);
      expect(source, path).not.toMatch(/X-Forwarded-For|CF-Connecting-IP/);
    }
  });
});
