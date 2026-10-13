# 01: Walking skeleton: a channel served by hostname on self-hosted PostgreSQL

**What to build:** One command starts the whole stack locally — PostgreSQL, Redis, MinIO, the API on Node.js, the storefront theme on Node.js, and Caddy in front. A seeded channel is reachable at its own hostname (e.g. `shop1.localhost`) and lists its products; a second seeded channel at another hostname lists only its own. This is the spike's slice made real: the shared schema and queries move to PostgreSQL (codemod + the `batch` shim + numeric type parsing), channel tables get the channel id and Row-Level Security, every request runs in one transaction pinned to the channel resolved from its hostname. The PostgreSQL test harness is set up here and the storefront read-path tests run on it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `docker compose up` brings the stack up from a clean checkout; the commands are documented in AGENTS.md
- [ ] Two seeded channels on two hostnames each list only their own products; an unknown hostname answers 404
- [ ] A query with no channel filter returns only the current channel's rows; a write into another channel is refused; no channel set returns nothing
- [ ] Constraints that lived only in D1 migrations (e.g. customer phone unique) exist in the PostgreSQL baseline, made unique per channel
- [ ] Aggregates (counts, averages) reach the API as numbers, not strings
- [ ] Storefront read-path tests run on PostgreSQL in CI; the Cloudflare code replaced here is removed
