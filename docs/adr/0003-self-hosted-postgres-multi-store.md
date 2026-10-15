# Self-hosted in Algeria: Orestor moves off Cloudflare to Node.js + PostgreSQL, stores isolated by Row-Level Security

**Status:** accepted (Oct 13 2026), after the porting spike below.

The Aventy store platform runs on servers we operate ourselves, because
customer personal data must stay in Algeria (law 18-07) and for cost and
control. Orestor today is built entirely on Cloudflare (Workers, D1, R2, KV,
Workflows, Images), so it has to be ported. The team keeps TypeScript to reuse
Orestor's code. External SaaS is allowed for non-sensitive parts.

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

Images (ticket 10): MinIO stopped publishing Docker images in 2025, so the
stack runs SeaweedFS behind the same S3 API; resizing is `sharp` in
cod-server (see `cod-server/src/endpoints/images/README.md`).

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
  Orestor's code; the team knows TypeScript.

## Consequences

- D1 → PostgreSQL is mostly mechanical (measured by the spike): a codemod
  ports the 57 tables and the 315 D1-only `.get()/.all()/.run()` calls; a
  `batch()` on the PostgreSQL db (savepoint, all or nothing) keeps the 27
  `db.batch()` call sites unchanged. `store_id` defaults to the request's
  store, so inserts and selects need no edit for multi-store.
- PostgreSQL runs READ COMMITTED where a D1 batch was serial. Guarded stock
  writes (3 places) must lock the rows they check (`SELECT … FOR UPDATE`),
  or concurrent orders oversell silently.
- node-postgres returns `COUNT`/`SUM`/`AVG` as strings; one global type
  parser restores numbers.
- Some constraints exist only in D1 migration SQL (e.g. `customers.phone`
  unique); the PostgreSQL baseline must re-add them. Unique keys such as
  order number, handle and SKU become unique per store.
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

## Porting spike (Oct 13 2026)

Branch `spike/pg-port`, `spikes/pg-port-PROTOTYPE/README.md`. One vertical
slice — store by hostname → product list → order creation → outbound Aventy
queue — runs on Node.js + PostgreSQL 18 with RLS, using Orestor's real
`cod-shared` code:

- All of cod-shared (69 files, 16.7k lines) typechecks against PostgreSQL
  after the codemod and 3 hand edits (~8 lines).
- RLS holds: a query without a store filter sees only the current store; a
  write into another store is refused; no store set returns nothing.
- Outbound queue: 300 orders drained by two "servers" while Aventy answered
  503 a third of the time — each delivered once, never in flight twice; a
  server dying mid-send releases its lock and the resend is deduplicated by
  the ULID.
- Estimate for the full port: **21–31 working days for one developer**.
  Tests (229 files on miniflare/D1 and a positional mock db) and replacing
  Cloudflare services (Workflows, R2, Images, KV, workers-oauth-provider)
  are the largest items; the database is the easy part.
- Found on the way, independent of the runtime: order numbers
  (`ORD-<date>-<4 random digits>`) collide at ~150 orders/store/day and the
  order fails — a lost sale; and Orestor refuses orders on short stock or a
  missing delivery rule, which the Aventy guide forbids.
