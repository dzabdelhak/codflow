# CodFlow — repository instructions for coding agents

CodFlow is a cash-on-delivery (COD) e-commerce platform for Algeria. Monorepo,
TypeScript. It is moving from Cloudflare to self-hosted Node.js + PostgreSQL
(ADR-0003): the API, the storefront and the dashboard run on Node +
PostgreSQL; images, MCP and background jobs still carry Cloudflare code until
their tickets in `.scratch/orestor-platform/issues/` port them.

## Layout

- `cod-server/` — API (Hono on Node.js, entry `src/node.ts`, app `src/app.ts`).
  Merchant `/api/*`, public `/store/*`, `/webhooks`, `/images`. PostgreSQL via
  Drizzle; one store (channel) per request, isolated by Row-Level Security
  (`src/db/scope.ts`). `/mcp` returns with ticket 16.
- `cod-client-astro/` — the merchant dashboard (Astro 7, Node adapter).
  Prerendered static pages + server routes for `/api/auth/*` (better-auth on
  PostgreSQL + Redis), `/mcp/oauth/login` and the SPA fallback; React
  islands fetch data from cod-server through `src/lib/api.ts` (the only module
  allowed to call the API). UI strings come from `locales/{ar,en,fr}` via
  `useT(namespace)` — the i18n guard test enforces three-locale parity.
- `cod-shared/` — shared Drizzle schema, queries, RBAC scopes, error codes.
  Imported by the apps via relative path (`../../cod-shared/...`). **Not
  published.**
- `cod-astro/theme01/` — storefront theme (Astro, Node adapter). One running
  storefront serves every channel; the visitor's hostname picks it. It is a swappable theme
  layer, not a platform package; keep engine logic out. Its commands and
  boundaries differ — read `cod-astro/theme01/AGENTS.md` before editing it.

There is **one root `package.json` with npm workspaces** and ONE root
`package-lock.json`. Never add per-package lockfiles. The root also carries the
repo-wide npm `overrides`: the single-Vite pin (keeps one Vite major across
astro/vitest; npm ignores `overrides` inside workspace members).

## Commands

One install at the repo root covers every package:

```sh
npm ci                          # at repo root — installs all workspaces
docker compose up -d db         # PostgreSQL on :5440 — needed by cod-server tests

cd cod-server && npm run typecheck
cd cod-server && npm test
cd cod-server && npm run db:setup   # migrate + demo channels + legal pages (DATABASE_URL)
cd cod-server && npm run dev        # Node, :8787 (DATABASE_URL, STOREFRONT_SERVICE_KEY)

docker compose up --build       # whole stack: http://shop1.localhost:8090, http://shop2.localhost:8090
```

Same for `cod-client-astro` (`npm run typecheck`, `npm test`, `npm run dev`
— astro dev on :4321, with the environment from `.env.example`). Admin
bootstrap: `cd cod-client-astro && DATABASE_URL=… npm run seed:admin --
--merchant=<id>` (sign-up is disabled by design; compose seeds
admin@example.com for the demo merchant).

`cod-astro/theme01` has extra validators — see
`cod-astro/theme01/AGENTS.md` for its commands.

## Cloud resource configuration

The PostgreSQL scripts (`db:migrate`, `db:seed:*`) read `DATABASE_URL` from
the environment. The remaining Cloudflare scripts (dashboard admin seed and
deploy, R2 CORS, carrier seeders) still read `<repo-root>/.env` through
`cod-server/scripts/cloud-env.mjs`. Precedence is
**`process.env` > `.env` > built-in default**; the committed template is
`<repo-root>/.env.example`.

Keys: `COD_ACCOUNT_ID`, `COD_DB_NAME`, `COD_R2_BUCKET_NAME`,
`COD_SERVER_URL`, `COD_MEDIA_DOMAIN`. Add a key to `DEFAULTS` in
`cloud-env.mjs` and to `.env.example` together — a key in one and not the
other is how these drift.

## Verification

- After changing TypeScript: run `npm run typecheck` in the affected package.
- After changing behavior: run `npm test` in the affected package.
- Full CI runs typecheck + tests for cod-server and cod-client-astro, plus
  `astro check` + tests for theme01 (`.github/workflows/ci.yml`).

## Conventions

- **README claims must be code-verified.** Never write a feature claim in the
  README that is not actually implemented. Before editing README feature lists,
  confirm the code exists.
- **Never commit secrets.** No live API keys, carrier tokens, or credentials in
  source, tests, or fixtures. Real secrets go in the deployment's environment
  (never in the repo); commit `.example` templates only. The defaults in
  `docker-compose.yml` are for local use.
- No explanatory code comments unless asked.

## Boundaries

- `cod-shared` is the single source of truth for the database schema, queries, RBAC
  scopes, and error codes. Do not duplicate schema or scope definitions in
  cod-server or cod-client-astro.
- Migrations (`cod-server/src/db/migrations`, PostgreSQL): add a new
  migration; never rewrite an already-applied one.
- Ask before adding a production dependency or changing the database schema.
- Keep engine logic out of `cod-astro/theme01`; the theme layer is meant to be
  swappable (see `cod-astro/theme01/AGENTS.md`).
- Dashboard data access goes through the API seam (`cod-client-astro/src/lib/api.ts`).
  Components never call `fetch` directly, and the dashboard does not query the
  database for business data — authorization lives in cod-server. (Its auth
  server reads identity tables for sign-in; nothing else.)

## Known traps

- Never create per-package `package-lock.json` files (see Layout). If a
  workspace's deps look stale, run `npm ci` at the repo root.
- The Vite pin lives in the **root** `package.json`
  (`"overrides": { "vite": "^8.2.2" }`) — npm ignores `overrides` inside
  workspace members. It keeps a single Vite major across astro/vitest;
  removing it reintroduces the dual-Vite boot crash
  (`Missing field 'moduleType'`). Keep it in sync when astro bumps Vite.
- **Every store-owned table is behind Row-Level Security.** Request code runs
  as the `codflow_app` role inside one transaction per request, pinned to its
  store with `set_config('app.store_id', …, true)` (`cod-server/src/db/scope.ts`).
  A query that forgets `WHERE store_id` still sees only its own store; with no
  store set it sees nothing. `store_id` is filled by a column default, so
  inserts never pass it. Platform code (routing, schedulers, cross-store
  jobs) uses the `codflow_platform` pool, which bypasses RLS — keep it out of
  request handlers. Request code cannot create or delete stores.
- **The storefront names its channel by hostname.** It sends the visitor's
  `Host` as `X-Channel-Host` together with `X-Storefront-Key`
  (`STOREFRONT_SERVICE_KEY`, identical on cod-server and theme01); cod-server
  trusts the hostname only with the key. Hostname → store lives in
  `store_domains`.
- **A channel serves its public pages only when `published`**
  (`cod-shared/channels/lifecycle.ts`): `suspended` answers the storefront
  with 503 `CHANNEL_UNAVAILABLE` (theme01 renders a neutral page), every
  other status with 404. Status changes go through
  `PATCH /api/merchant/stores/:id/status`, which logs them and asks the
  storefront to drop that channel's cached pages
  (`STOREFRONT_INTERNAL_URL`, `POST /api/channel-cache`). Without that URL a
  change shows on cached pages only once their `maxAge` runs out.
- **A merchant owns stores and users** (`merchants`; `merchant_id` on `users`
  and `stores`). Every user of a merchant may open all of its stores. The
  dashboard sends the active store as `X-Store-Id`; `/api/*` runs auth (on the
  platform pool), then `dashboardScope`, which accepts the store only when the
  user's merchant owns it and pins both `app.merchant_id` and `app.store_id`.
  `users`, `user_scopes`, `accounts`, `sessions` and `merchants` are under
  merchant RLS. Store creation (`POST /api/merchant/stores`) goes through the
  plan-policy seam (`cod-server/src/platform/plan-policy.ts`) — Aventy's plan
  check plugs in there. `/webhooks` and `/images` still serve the deployment's
  only store until their tickets.
- Single-row reads end in `.then(first)` (row or undefined, D1's `.get()`);
  a write's `returning()` that must give a row ends in `.then(one)` (throws
  otherwise) — both from `cod-shared/db/client.ts`.
- **PostgreSQL is READ COMMITTED; D1 batches were serial.** A guarded write
  (`UPDATE … WHERE inventory >= qty`) can match 0 rows after waiting on a
  lock and commit silently — an oversell. The stock guards (storefront and
  dashboard orders, stock adjustments) read their row `FOR UPDATE`, so a
  concurrent order waits and re-checks; `money-integrity-probes.e2e.test.ts`
  holds it deterministically. Any new check-then-write must lock what it reads.
- node-postgres returns `COUNT`/`SUM`/`AVG` as strings; `src/db/scope.ts`
  installs parsers that turn them back into numbers. Several queries in one
  `Promise.all` share the request's single connection; pg queues them (it
  warns that pg 9 will not).
- `PUBLIC_API_URL` is a **build-time** client value: `astro:env/client` inlines
  it into the browser bundle, so changing it requires a rebuild (the dashboard
  Docker image takes it as a build arg). At run time the dashboard reads its
  server settings from the environment (`cod-client-astro/.env.example`).
  On `app.<domain>` the browser derives the API as `api.<domain>`, same scheme
  and port (`src/lib/api.ts`).
- `BETTER_AUTH_SECRET` and `MCP_LOGIN_TICKET_SECRET` must be **identical** on
  cod-server and cod-client-astro. cod-server verifies the dashboard's JWT
  against its JWKS; set `BETTER_AUTH_JWKS_URL` when the public auth URL is
  not reachable from the API (inside Docker: `http://dashboard:4321/api/auth/jwks`).
- Better Auth 1.7 needs `accounts.issuer` ('local:credential', account_id =
  user id) and `jwkss.alg/crv` (in the baseline). Its secondary storage is
  Redis (`cod-client-astro/src/lib/auth/redis-storage.ts`), which must keep
  the `increment` method the rate limiter requires.
- OAuth provider tables predate better-auth 1.7: `oauthClients`,
  `oauthAccessTokens`, `oauthRefreshTokens`, `oauthConsents` are missing some
  1.7 columns, and `oauthResource(s)`, `oauthClientResource(s)`,
  `oauthClientAssertion(s)` do not exist yet. Core auth + dashboard work;
  MCP client token flows may need that alignment before heavy use.
- The dashboard and the storefront both default to port **4321** — run
  one on `--port 4322` when developing both at once.
- Inbound webhooks exist only for **Yalidine** and **ZR Express**. NOEST and
  EcoTrack tracking is pulled on demand via `GET /orders/:id/tracking` — there
  is no inbound receiver for them.
- The **shopping cart is off by default, per store** (`stores.cart_enabled`).
  A store that never enables it ships no cart markup at all. Rollback for the
  whole feature is `UPDATE stores SET cart_enabled = 0` — there is no data
  migration to reverse, because a multi-line order is a valid CodFlow order the
  dashboard and carriers already understand.
- **An order is either a basket or a single product.** `items[]` supersedes the
  flat `productId`/`productName`/`pricePerUnit`, which are optional only when
  `items[]` is present. `cod-shared/queries/cart.ts` (`normalizeOrderLines`) is
  the single place the shapes meet — do not branch on them anywhere else.
- **The basket lives in the shopper's browser, never in the database.** The client's
  `pricePerUnit` is display-only; every line is re-priced from the catalog
  server-side. Never trust a cart total that arrived over the wire.
- The mock db in cod-server's unit tests maps a full-table `select()`
  **positionally by schema column order**. Adding a column to a table breaks
  every fixture for it until the new field is inserted at the same position —
  this is why those fixtures list columns in schema order with a comment.
  (`store_id`, first on every store-owned table, is prepended for you.)
- cod-server tests run on a **real PostgreSQL**: `docker compose up -d db`, or
  `TEST_DATABASE_URL`. `src/test-utils/pg.ts` migrates a template once and
  gives each test file its own database, pinned to a store under RLS. Test
  files not yet ported are listed in `cod-server/pending-pg-port.json` with
  their owning ticket; vitest and the typecheck skip them. Port a file, then
  remove its line — the list only shrinks.
- Rich text (product descriptions, legal pages) is sanitised by lol-html via
  `html-rewriter-wasm` — the same engine as Cloudflare's HTMLRewriter, so the
  sanitiser tests keep their meaning. Do not swap the parser.
- **A store is never born with its four legal pages automatically** — there
  is no channel-creation flow to hook a seed into yet (ticket 07).
  `npm run db:setup` (cod-server) runs `scripts/seed-store-pages.ts` as its
  last step: the app's own `seedStorePages` for every store, idempotent and
  safe to re-run (`-- --store-id=<id>` for one store). The dashboard's Pages
  screen → "Add Terms, Privacy, Refund & Shipping" calls the same
  `POST /api/store-pages/seed-defaults`. Without
  this, Meta Ads rejects the store's ads for missing policy pages — see
  `report-md/LEGAL_PAGES_PLAN.md`.

## Skills

This project has custom skills for AI agents. When working on specific tasks, activate the relevant skill:

### Route Builder (API Endpoints)

For creating or migrating API endpoints, use the **route-builder** skill:

```bash
# Activate the skill (if using Kiro with skills)
disclose_context: route-builder
```

This skill provides:
- **SKILL.md** - Quick reference for the defineRoute() pattern
- **MIGRATION.md** - Step-by-step guide for migrating existing endpoints
- **NEW-ENDPOINTS.md** - Guide for creating new endpoints
- **EXAMPLES.md** - Real-world examples from the codebase

### Key Patterns

**Always use defineRoute() for new endpoints:**
```typescript
import { defineRoute } from "@/lib/route-builder";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";

const myRoute = defineRoute({
  method: "get",
  path: "/my-resource",
  auth: { scope: SCOPES.RESOURCE_READ },  // Always use SCOPES constants
  handler: handlers.list,
});

router.openapi(myRoute.route, myRoute.handler);
```

**Migration workflow:**
1. Create `routes.prototype.ts` 
2. Convert routes using defineRoute()
3. Run tests: `npm test -- <endpoint>`
4. Verify no behavior changes

### Available Skills

| Skill | When to Use |
|-------|-------------|
| `route-builder` | Creating or migrating API endpoints |
| `code-review` | Reviewing code changes |
| `codebase-design` | Understanding architecture |
| `prototype` | Building throwaway prototypes |
| `improve-codebase-architecture` | Refactoring or architecture changes |
| `tdd` | Test-driven development |
| `wayfinder` | Navigating the codebase |
| `codflow-setup` | Setting up the project (Cloudflare + Vercel) |
| `storefront-vercel` | Deploying or configuring the customer storefront on Vercel |
| `whatsapp-otp` | WhatsApp OTP verification feature (dzverify) |
| `Ecotrack` | EcoTrack carrier integration |
| `zr-express` | ZR Express delivery platform integration (129 endpoints, organized per domain) |
| **`diagnosing-bugs`** | **Debug production issues (orders, delivery, payments)** |
| **`domain-modeling`** | **Design data models for complex domain** |
| **`implement`** | **Turn specs into working code** |
| **`to-spec`** | **Convert ideas into formal specifications** |
| **`to-tickets`** | **Break features into GitHub issues** |

For more details on any skill, see the `.agents/skills/` directory.
