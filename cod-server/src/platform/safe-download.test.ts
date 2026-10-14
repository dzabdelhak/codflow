import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { downloadPublic, isPublicAddress } from "./safe-download";

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/image") return res.end(Buffer.from("image-bytes"));
    if (req.url === "/big") return res.end(Buffer.alloc(2048));
    if (req.url === "/to-metadata") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("public addresses", () => {
  it("exclude loopback, private, link-local, carrier-grade NAT and IPv4-mapped forms of them", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });
});

describe("downloadPublic", () => {
  it("refuses a host that resolves to the local network, without connecting", async () => {
    expect(await downloadPublic(`${base}/image`, { capBytes: 1024 })).toEqual({ ok: false, reason: "blocked" });
    expect(await downloadPublic("http://169.254.169.254/latest/meta-data/", { capBytes: 1024 })).toEqual({ ok: false, reason: "blocked" });
    expect(await downloadPublic("http://[::1]:80/", { capBytes: 1024 })).toEqual({ ok: false, reason: "blocked" });
  });

  it("downloads from an allowed host, caps the size, and checks every redirect hop", async () => {
    const allowLoopback = (address: string) => address === "127.0.0.1" || isPublicAddress(address);
    expect(await downloadPublic(`${base}/image`, { capBytes: 1024, allow: allowLoopback })).toEqual({
      ok: true,
      bytes: new Uint8Array(Buffer.from("image-bytes")),
    });
    expect(await downloadPublic(`${base}/big`, { capBytes: 1024, allow: allowLoopback })).toEqual({ ok: false, reason: "too_large" });
    expect(await downloadPublic(`${base}/to-metadata`, { capBytes: 1024, allow: allowLoopback })).toEqual({ ok: false, reason: "blocked" });
    expect(await downloadPublic(`${base}/missing`, { capBytes: 1024, allow: allowLoopback })).toEqual({ ok: false, reason: "status", status: 404 });
    expect(await downloadPublic("ftp://example.com/a.png", { capBytes: 1024 })).toEqual({ ok: false, reason: "bad_url" });
  });
});
