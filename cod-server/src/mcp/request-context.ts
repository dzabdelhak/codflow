import type { Redis } from "@/platform/redis";
/**
 * Per-request client context and the MCP tool-call rate limit built on it.
 *
 * Clients like ChatGPT attach hints on every tools/call request's `_meta`:
 *   • `openai/subject` — anonymized user id (rate limiting / identification)
 *   • `openai/session` — anonymized conversation id (correlating calls)
 * Per the plugin reference these are HINTS ONLY — never relied on for
 * authorization, always tolerated when absent. Authorization remains OAuth
 * scopes + the verified session identity (McpProps).
 *
 * The rate limit implements the MCP spec's security requirement ("servers
 * MUST rate limit tool invocations") as a coarse, fail-open abuse guard over
 * Redis: a fixed window counter per subject (falling back to the verified
 * user id when no client hint exists). A Redis hiccup must never block a
 * legitimate tool call, only sustained abuse gets stopped.
 */

/** Rolling window length and per-subject call budget. Generous on purpose —
 *  a ChatGPT pipeline polling several upload jobs stays far below it. */
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_CALLS = 200;

export interface ClientMeta {
  subject?: string;
  session?: string;
}

/** Read the client-supplied per-request hints; absent/invalid values yield {}. */
export function readClientMeta(ctx: unknown): ClientMeta {
  const meta = (ctx as { mcpReq?: { _meta?: Record<string, unknown> } } | undefined)?.mcpReq
    ?._meta;
  if (!meta) return {};
  const subject = typeof meta["openai/subject"] === "string" ? meta["openai/subject"] : undefined;
  const session = typeof meta["openai/session"] === "string" ? meta["openai/session"] : undefined;
  return { ...(subject !== undefined ? { subject } : {}), ...(session !== undefined ? { session } : {}) };
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Coarse fixed-window counter in Redis. Fail-open by design: no Redis or any
 * Redis error allows the call — the scope gate and audit trail remain the
 * security boundary; this guard only stops sustained flooding.
 */
export async function checkMcpRateLimit(redis: Redis | null, subject: string): Promise<RateLimitResult> {
  if (!redis) return { allowed: true };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSeconds / RATE_LIMIT_WINDOW_SECONDS);
  const key = `mcp:rl:${subject}:${windowIndex}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS * 2);
    if (count > RATE_LIMIT_MAX_CALLS) {
      return { allowed: false, retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS - (nowSeconds % RATE_LIMIT_WINDOW_SECONDS) };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
