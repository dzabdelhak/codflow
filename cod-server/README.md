# CodFlow Server

The backend engine for CodFlow — a COD-first e-commerce platform for Algeria
that is **agentic-ready**. It exposes the merchant REST API, the public
storefront API, delivery-carrier webhooks, and a complete **MCP remote server**
(RFC 9728) so AI agents can operate the store with RBAC-scoped tools. Built on
Node.js, Hono and Drizzle ORM over PostgreSQL, with Row-Level Security per
store and a PostgreSQL job queue for background work.

This package is part of the [CodFlow monorepo](../README.md). The dashboard
(`cod-client-astro`) and storefront (`cod-astro`) live in sibling folders and
share database schema + query logic via `cod-shared`.

## Tech Stack

- **Runtime:** Node.js (`@hono/node-server`, entry `src/node.ts`, app `src/app.ts`)
- **Framework:** Hono
- **Database:** PostgreSQL via Drizzle ORM, one transaction per request pinned to its store (`src/db/scope.ts`)
- **Cache / rate limits:** Redis
- **Images:** S3-compatible storage (SeaweedFS in Docker Compose)
- **Validation:** Zod
- **API docs:** [@hono/zod-openapi](https://github.com/honojs/middleware) — the OpenAPI 3.1 spec generates from the route definitions themselves
- **Language:** TypeScript

## Getting Started

### Prerequisites

- Node.js 22.12+ and npm
- Docker (PostgreSQL for the tests; the whole stack with `docker compose up --build`)

### 1. Install

```bash
npm ci                      # at the repo root — installs all workspaces
docker compose up -d db     # at the repo root — PostgreSQL on :5440
```

### 2. Create the database schema

```bash
# Apply migrations + seed the demo channels and their legal pages
DATABASE_URL=postgres://… npm run db:setup
```

`db:setup` is idempotent; `scripts/seed-store-pages.ts` (its last step) also
works alone with `npm run db:seed:legal-pages`.

> **First dashboard login:** the dashboard disables sign-up — create the admin
> with the seeder instead (see `cod-client-astro/README.md`):
> ```bash
> cd ../cod-client-astro && DATABASE_URL=postgres://… npm run seed:admin -- --merchant=<id>
> ```

### 3. Run locally

```bash
npm run dev
# Server → http://localhost:8787
# OpenAPI spec → http://localhost:8787/api/openapi.json
```

`npm run dev` reads its settings from the environment (`DATABASE_URL`,
`STOREFRONT_SERVICE_KEY`, `S3_*`, …). The easiest full setup is
`docker compose up --build` at the repo root.

### 4. Test

```bash
npm run typecheck
npm test          # full suite (Vitest) on a real PostgreSQL — needs `docker compose up -d db` or TEST_DATABASE_URL
```

### 5. Deploy

See [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Environment Variables

The main ones: `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT` / `S3_BUCKET` /
`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`, `STOREFRONT_SERVICE_KEY` (same
value as the storefront's), `BETTER_AUTH_SECRET` (same value as the
dashboard's), `BETTER_AUTH_URL` and `PUBLIC_API_URL`. The full list is in
[`docs/CONFIGURATION.md`](../docs/CONFIGURATION.md); the types are in
`src/types/env.ts`.

## Project Structure

```
cod-server/
├── src/
│   ├── node.ts                # Node entry — env, database pools, job + outbound workers, housekeeping timers
│   ├── app.ts                 # Hono app — wires routes, MCP server
│   ├── types/                 # Env and app context types
│   ├── db/                    # Drizzle helpers (schema re-export, request scope, migrate, migrations/)
│   ├── middleware/            # dashboard JWT/bearer auth, storefront key, CORS, error handling
│   ├── endpoints/             # One folder per domain (see route list below)
│   ├── lib/                   # Meta CAPI client, activity log, shared errors
│   ├── mcp/                   # MCP remote server (OAuth provider wiring + scope-gated tool registry)
│   ├── tracking/              # Server-side conversions: enqueue, job handler, provider senders
│   ├── platform/              # Job queue, outbound orders, channel domains, image store, Redis
│   ├── cron/                  # Housekeeping handlers (orphan-image sweep, abandoned-order sweep)
│   ├── openapi/               # OpenAPI assembly: security schemes, Swagger UI, shared Zod schemas — the served spec generates from route definitions
│   ├── rbac/                  # Scope-based authorization middleware
│   └── test-utils/            # Shared test helpers
├── scripts/                   # seeders (demo channels, legal pages, EcoTrack companies), legacy image import
├── drizzle.config.ts
└── vitest.config.ts
```

## API Overview

REST API is mounted under `/api/*`. It is fully documented by an OpenAPI 3.1
spec that is **generated from the route definitions** (`@hono/zod-openapi`):

- Machine-readable spec: `/api/openapi.json`
- Interactive Swagger UI: `/api/docs`

Public routes: `/`, `/health`, `/images`, `/api` (OpenAPI spec + docs),
`/webhooks/*` (delivery-carrier callbacks, signature-verified), `/store/*`
(storefront read + order placement, `X-Storefront-Key` + `X-Channel-Host`), `/.well-known/*`, and
`/mcp` (MCP protocol). All other `/api/*` routes require a session or bearer token.

- `/api/orders` — orders, status lifecycle, driver assignment, stats
- `/api/customers`, `/api/customer-groups`, `/api/customer-tags`
- `/api/drivers`, `/api/driver-payments`
- `/api/products`, `/api/product-groups`, `/api/products/:id/variants` (variants are nested, not a top-level route), `/api/stock`, `/api/offers`, `/api/reviews`
- `/api/wilayas`, `/api/shipping-profiles`
- `/api/delivery-companies` — carrier adapters (Yalidine, ZR Express, NOEST, EcoTrack) + webhook handlers
- `/api/stores` — `me`, `pixel-config` (the public storefront API lives at `/store/*`)
- `/api/users` — staff/admin + API keys
- `/api/analytics`, `/api/activity-logs`, `/api/abandoned-orders`
- `/api/images` — image upload (`POST /api/images/upload`, stored as WebP in S3 storage)
- `/api/mcp` — MCP agent connection management (`/me`, `/team`; the `/mcp` endpoint itself serves the MCP protocol)

## Notable Subsystems

### MCP remote server
`src/mcp/` implements an MCP (Model Context Protocol) server so AI agents can
manage one channel. The dashboard's better-auth OAuth provider authorises the
agent for the channel the merchant picks; `/mcp` verifies the access token
against the dashboard's JWKS and the stored consent, then runs the request in
that channel's RLS scope with the tools of the granted scopes. See
`docs/MCP.md`.

### Server-side conversions
`src/tracking/` queues one conversion per configured provider (Meta, TikTok,
Snapchat, GA4) in the `jobs` table, in the transaction that places or advances
the order, at the stage the merchant optimises for. The worker started by
`src/node.ts` (`src/platform/jobs.ts`, `FOR UPDATE SKIP LOCKED`) sends them
with the order id as the deduplication id and retries outages. See
`docs/TRACKING.md`.

### Housekeeping
`src/node.ts` runs daily timers: the orphan-image sweep and the pruning of
finished jobs and old blocked order attempts.

## Contributing

- One endpoint = one folder in `src/endpoints/`, following the
  `routes.ts` / `handlers.ts` / `validation.ts` split.
- Define routes with `defineRoute()` from `src/lib/route-builder` on an
  `OpenAPIHono` router: the route definition is the single source of truth
  for both request validation and the OpenAPI spec — there are no
  hand-written spec files to keep in sync. Every domain is already on this
  pattern; see `src/endpoints/README.md` for the current state and
  `.agents/skills/route-builder/NEW-ENDPOINTS.md` for the how-to. Reuse
  shared response schemas from `src/openapi/schemas.ts`.
- Shared schema and read queries live in `cod-shared` — do not duplicate them
  in `cod-server/src/db`.
- Never commit real credentials; if you add an env var, declare it in
  `src/types/env.ts` and document it in `docs/CONFIGURATION.md`.
- Run `npm run typecheck` and `npm test` before opening a PR.

## License

Open source. See the [repository root](../README.md) for the license.