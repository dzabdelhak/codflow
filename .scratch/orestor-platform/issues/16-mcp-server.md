# 16: MCP server on the self-hosted platform

**What to build:** The MCP server that lets AI agents manage a store keeps working on Node.js, scoped to the channel the authorising merchant selects. Its OAuth no longer depends on Cloudflare's workers-oauth-provider or KV; it uses the platform's auth (better-auth's OAuth provider on PostgreSQL, Redis for short-lived state), including the missing better-auth 1.7 OAuth tables noted in AGENTS.md.

**Blocked by:** 03

**Status:** done

- [x] An MCP client completes OAuth against the platform and lists the products of the chosen channel
- [x] A token for channel A cannot read channel B
- [x] No Cloudflare OAuth provider or KV code remains
