import { BlockList, isIP, type LookupFunction } from "node:net";
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    return !blocked.check(address, "ipv6");
  }
  return !blocked.check(address, "ipv4");
}

export class BlockedAddressError extends Error {
  constructor() {
    super("The address is not on the public internet");
    this.name = "BlockedAddressError";
  }
}

function guardedLookup(allow: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses as unknown as Array<{ address: string; family: number }>;
      const safe = list.find((entry) => allow(entry.address));
      if (!safe || list.some((entry) => !allow(entry.address))) return callback(new BlockedAddressError(), "", 0);
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, [safe]);
      callback(null, safe.address, safe.family);
    });
  };
}

export type DownloadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "blocked" | "unreachable" | "too_large" | "too_many_redirects" | "bad_url" }
  | { ok: false; reason: "status"; status: number };

export interface DownloadOptions {
  capBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allow?: (address: string) => boolean;
}

function requestOnce(url: URL, capBytes: number, timeoutMs: number, lookup: LookupFunction): Promise<{ status: number; location?: string; bytes?: Uint8Array; tooLarge?: boolean }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(url.href, { lookup, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ status, location: res.headers.location });
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return resolve({ status });
      }
      if (Number(res.headers["content-length"] ?? 0) > capBytes) {
        res.destroy();
        return resolve({ status, tooLarge: true });
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > capBytes) {
          res.destroy();
          resolve({ status, tooLarge: true });
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ status, bytes: new Uint8Array(Buffer.concat(chunks)) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

export async function downloadPublic(
  rawUrl: string,
  { capBytes, timeoutMs = 30_000, maxRedirects = 3, allow = isPublicAddress }: DownloadOptions,
): Promise<DownloadResult> {
  const lookup = guardedLookup(allow);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "bad_url" };
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "bad_url" };
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && !allow(literal)) return { ok: false, reason: "blocked" };
    let response;
    try {
      response = await requestOnce(url, capBytes, timeoutMs, lookup);
    } catch (err) {
      return { ok: false, reason: err instanceof BlockedAddressError || (err as { cause?: unknown }).cause instanceof BlockedAddressError ? "blocked" : "unreachable" };
    }
    if (response.location) {
      url = new URL(response.location, url);
      continue;
    }
    if (response.tooLarge) return { ok: false, reason: "too_large" };
    if (!response.bytes) return { ok: false, reason: "status", status: response.status };
    return { ok: true, bytes: response.bytes };
  }
  return { ok: false, reason: "too_many_redirects" };
}
