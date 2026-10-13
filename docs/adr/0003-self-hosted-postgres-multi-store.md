# Self-hosted in Algeria: CodFlow moves off Cloudflare to Node.js + PostgreSQL, stores isolated by Row-Level Security

**Status:** proposed — to confirm after a porting spike.

The Aventy store platform runs on servers we operate ourselves, because
customer personal data must stay in Algeria (law 18-07) and for cost and
control. CodFlow today is built entirely on Cloudflare (Workers, D1, R2, KV,
Workflows, Images), so it has to be ported. The team keeps TypeScript to reuse
CodFlow's code. External SaaS is allowed for non-sensitive parts.

## Decision

| Concern | Cloudflare today | Self-hosted |
|---|---|---|
| Runtime | Workers | Node.js running the existing Hono apps; Astro with the Node adapter |
| Database | D1 (SQLite) | PostgreSQL (Drizzle `pg-core`) |
| Store isolation | single-tenant | shared tables with `store_id` + PostgreSQL Row-Level Security; each request sets the current store on its transaction, so a query that forgets the filter returns nothing from other stores |
| Platform data | — | accounts, stores, domains → store routing, plan limits, merchant-wide phone blocklist: PostgreSQL tables outside RLS, reachable only from platform code |
| Files / images | R2 + Images | S3-compatible storage (MinIO) + `sharp`/imgproxy |
| Sessions, rate limits | KV | Redis |
| Background jobs (Aventy order queue, heartbeat, Meta/TikTok events, image processing) | Workflows | job queue on PostgreSQL or Redis, with per-job locking |
| Domains + TLS | Cloudflare | Caddy with on-demand TLS: certificates issued automatically for each merchant domain and our subdomains |
| Packaging | wrangler deploys | Docker images + versioned config, reproducible install (Aventy guide §8) |

Aventy guide rule 8 (several servers from day one): app servers are
stateless; the outbound order queue reserves each order with a row lock
(`SELECT … FOR UPDATE SKIP LOCKED`); the one-minute heartbeat is a single
scheduled job guarded by a lock that polls Aventy for every store and only
syncs stores Aventy reports as changed.

## Considered Options

- **Stay on Cloudflare**: rejected — customer data must be hosted in Algeria.
- **Durable Object per store** (spike on branch `spike/multi-store`):
  Cloudflare-only, so no longer available. The spike's leak demo still holds
  and is what RLS addresses.
- **Schema or database per store in PostgreSQL**: rejected for now —
  migrations across thousands of schemas/databases and connection pooling get
  hard; RLS gives the isolation guarantee with one schema.
- **Self-host the Workers runtime (workerd)**: rejected — no D1, and Durable
  Object storage is local to one machine, which breaks the multi-server rule.
- **Rewrite in another stack (e.g. Laravel)**: rejected — throws away
  CodFlow's code; the team knows TypeScript.

## Consequences

- Largest piece of work: D1 → PostgreSQL. 57 table definitions move from
  `sqlite-core` to `pg-core`, 82 raw SQL fragments need review, migrations are
  rewritten, and `store_id` + RLS policies are added to the business tables.
  Most of the ~530 Drizzle query sites keep their shape.
- `db.batch()` (27 sites, D1-only) becomes transactions.
- Cloudflare-specific code to replace: Workflows (CAPI, landing-page image
  upload), `cloudflare:workers` imports, `@astrojs/cloudflare` (8 places),
  `better-auth-cloudflare` and its KV secondary storage.
- We operate the servers: backups with tested restores, monitoring, alerting
  on orders stuck > 24 h (guide §6), OS and PostgreSQL upgrades.
- SaaS still allowed for non-sensitive parts (Turnstile, Meta/TikTok APIs).
  **Open:** a foreign CDN/proxy in front of the storefront would terminate TLS
  abroad and see order-form data — confirm with Aventy's legal team whether
  that counts as a transfer under law 18-07 before using one for anything
  beyond static assets. Same question for server-side Meta/TikTok events
  (hashed personal data).
- Supersedes the "multi-store isolation approach" open question in ADR-0002.

## Next

A porting spike: move one vertical slice (store resolution by hostname →
product list → order creation into the outbound queue) to Node.js +
PostgreSQL with RLS, to measure the real porting effort before confirming
this ADR.
