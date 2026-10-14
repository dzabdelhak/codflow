import { isIP } from "node:net";
import type { Context } from "hono";
import type { AppContext } from "@/types";

export const VISITOR_IP_HEADER = "X-Visitor-IP";

export function visitorIp(c: Context<AppContext>): string | null {
  const value = c.req.header(VISITOR_IP_HEADER)?.trim();
  return value && isIP(value) ? value : null;
}
