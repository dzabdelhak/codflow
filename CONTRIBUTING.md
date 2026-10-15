# Contributing to Orestore

Thanks for wanting to help! Orestore is a COD-first e-commerce platform for the
Algerian market, built as a monorepo of four packages running on Node.js +
PostgreSQL (see [ADR-0003](./docs/adr/0003-self-hosted-postgres-multi-store.md)).

---

## Table of contents

1. [Repository layout](#repository-layout)
2. [Where do I start? (first contribution)](#where-do-i-start-first-contribution)
3. [First-time setup](#first-time-setup)
4. [Local development](#local-development)
5. [Configuration](#configuration)
6. [Architecture & code conventions](#architecture--code-conventions)
7. [Testing](#testing)
8. [Commit & PR guidelines](#commit--pr-guidelines)
9. [Hard rules](#hard-rules)
10. [Getting help](#getting-help)

---

## Repository layout

```
codflow-os/
├── cod-server/        # Backend API  — Hono on Node.js (PostgreSQL + S3 images)
├── cod-client-astro/  # Merchant dashboard — Astro (prerendered + auth server routes)
├── cod-astro/         # Customer storefront — Astro, trilingual (AR/FR/EN)
│   └── theme01/       #   the default theme (theme layer is swappable)
└── cod-shared/        # Source-shared TS — Drizzle schema, RBAC scopes, queries
```

npm workspaces: one root `package.json` and a single root `package-lock.json`.
Install once at the repo root (`npm ci`) — never add per-package lockfiles.
`cod-shared` is consumed directly from source via relative imports
(`../../cod-shared/...`) — it has no build step.

### Package scripts

| Package             | Dev          | Test        | Build       |
|---------------------|--------------|-------------|-------------|
| `cod-server`        | `npm run dev`| `npm test`  | — (runs with `tsx`) |
| `cod-client-astro`  | `npm run dev`| `npm test`  | `npm run build` |
| `cod-astro/theme01` | `npm run dev`| `npm test`  | `npm run build` |

Run package scripts either from inside the package directory or with
`npm run <script> --workspace <package-name>` from the repo root.

---

## Where do I start? (first contribution)

New here? Here's the shortest path to a merged change:

1. **Find an issue.** Look for issues labeled `good first issue`. They are
   scoped so a first-time contributor can finish them in one sitting.
2. **Pick your package.** Each package is self-contained (see the layout above).
   The `Area` dropdown in the issue tells you which one a task touches.
3. **Set up once.** Complete the [First-time setup](#first-time-setup) section —
   it takes about 10 minutes and applies to every later contribution.
4. **Make a small change.** Keep it under ~500 lines. Follow the conventions in
   [Architecture & code conventions](#architecture--code-conventions) — if the
   task touches `cod-shared`, read that boundary first.
5. **Verify before pushing.** Run `npm run typecheck` and `npm test` in the
   package you changed (theme01: `npx astro check` + `npm test`). CI runs the
   same checks.
6. **Open a PR** using the PR template. Mention the issue with "Closes #N".
7. **Review happens on the PR.** Keep it small, respond to feedback, and CI must
   be green.

> Tips:
> - `cod-astro/theme01` is the most self-contained package — a good place to
>   start if you are new to the platform.
> - The storefront's `src/core/` is **off-limits** (platform-owned engine). New
>   storefront work goes in `src/theme/`.
> - Never put a real secret in your PR — secrets live in the deployment's
>   environment, never in source or a committed config file.

## First-time setup

### Prerequisites

- **Node.js 22.12+** and npm
- **Docker** with Docker Compose (PostgreSQL, Redis, SeaweedFS and the full stack)

> The repo's `.nvmrc` pins Node 24; CI runs Node 24. Astro 7 (the storefront)
> requires Node 22.12+.

> 🤖 **Working with an AI Coding Assistant?** Instruct your agent: *"Set up Orestore"* and it will follow the [`codflow-setup` skill](./.agents/skills/codflow-setup/SKILL.md).

#### 1. Install dependencies

One install at the repo root covers every workspace (single root lockfile —
never add per-package lockfiles):

```bash
npm ci
```

#### 2. Run the whole stack

```bash
docker compose up --build
```

Storefronts at http://shop1.localhost:8090 and http://shop2.localhost:8090,
dashboard at http://app.localhost:8090 (`admin@example.com` /
`admin-dev-password`). Compose migrates the database, seeds two demo channels
and the demo admin.

#### 3. Run the tests

The cod-server tests run on a real PostgreSQL:

```bash
docker compose up -d db
cd cod-server && npm run typecheck && npm test
```

---

## Local development

To work on one package outside Docker, keep the services it needs running
(`docker compose up -d db redis objects`) and start it with `npm run dev`:

| # | Command               | What runs                                 |
|---|-----------------------|-------------------------------------------|
| 1 | `cd cod-server && npm run dev`              | API on `http://localhost:8787` (+ OpenAPI at `/api`) |
| 2 | `cd cod-client-astro && npm run dev`        | Dashboard on `http://localhost:4321` |
| 3 | `cd cod-astro/theme01 && npm run dev`       | Storefront on `http://localhost:4321` — run `astro dev --port 4322` when the dashboard is up |

`cd cod-server && npm run db:setup` migrates the database named by
`DATABASE_URL` and seeds the demo channels and their legal pages. Sign-up is
disabled by design; provision a dashboard admin with
`cd cod-client-astro && DATABASE_URL=… npm run seed:admin -- --merchant=<id>`
(it prints a generated password and API key).

---

## Configuration

**There is no hardcoded configuration.** Every package reads its URLs and
secrets from the environment. [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md)
lists every variable; `docker-compose.yml` carries local defaults, and
`cod-client-astro/.env.example` the dashboard's. `BETTER_AUTH_SECRET` must be
identical on cod-server and the dashboard, and `STOREFRONT_SERVICE_KEY` on
cod-server and the storefront.

---

## Architecture & code conventions

### The `cod-shared` boundary

- **Database schema** lives in `cod-shared/db/schema.ts` — one source of truth.
- **Read queries** live in `cod-shared/queries/*.ts`; `cod-server` handlers
  consume them (and re-export per domain).
- **RBAC scopes** live in `cod-shared/rbac/scopes.ts`.

> Do **not** duplicate schema or query logic inside a package. If you touch a
> domain's reads, update the shared query, not a local copy.

### Backend endpoints (`cod-server`)

One folder per domain under `src/endpoints/`:

```
orders/
├── routes.ts       # Hono route wiring
├── handlers.ts     # request handling + errors (BusinessLogicError, NotFoundError, …)
├── validation.ts   # Zod schemas
├── openapi.ts      # OpenAPI spec for the route
└── queries.ts      # THIN re-export of the shared query module
```

- Mount routes in `src/app.ts`.
- New env vars must be declared in `src/types/env.ts` and documented in
  `docs/CONFIGURATION.md`.

### Dashboard (`cod-client-astro`)

- **All data flows through the API seam** (`src/lib/api.ts`) — browser →
  cod-server REST with a short-lived JWT. Components never call `fetch`
  directly.
- Pages are prerendered shells; interactive regions are React islands.
  Auth lives on the dashboard's server routes (`/api/auth/*`) only.
- UI strings come from `locales/{ar,en,fr}/*.json` via `useT(namespace)` —
  never hardcoded. The i18n guard test enforces three-locale parity.

### Storefront (`cod-astro/theme01`)

- `src/core/` is the **core engine** — "DO NOT MODIFY". All HTTP calls go
  through `src/core/api/client.ts`.
- `src/theme/` is the swappable **theme layer** (layout, colors, copy). A new
  theme = a new folder, not edits to the core.
- All user-facing text needs AR/FR/EN translations.
- Keep RTL support working.

### Naming

- New identifiers and variables: `camelCase`. Components: `PascalCase`.
- DB columns: `snake_case`.
- Commit messages: **Conventional Commits** — `feat(orders): …`, `fix(validation): …`,
  `ui(products): …`, `docs(openapi): …`, `chore(…): …`.

---

## Testing

Run the full suite of a package before pushing:

```bash
cd cod-server        && npm test       # 1386 tests
cd cod-client-astro  && npm test       # 139 tests
cd cod-astro/theme01 && npm test       # property + behavior tests
```

- New endpoints must ship with tests (`handlers.test.ts`, `validation.test.ts`).
- Property tests for the storefront scripts use `fast-check`.
- If a test is genuinely obsolete (e.g. it documents a bug in a feature that was
  removed), **delete it** — never leave an intentionally failing test in the tree.

- New endpoints must ship with tests (`handlers.test.ts`, `validation.test.ts`).
- Property tests for the storefront scripts use `fast-check`.
- If a test is genuinely obsolete (e.g. it documents a bug in a feature that was
  removed), **delete it** — never leave an intentionally failing test in the tree.

---

## Commit & PR guidelines

1. Keep changes scoped to one package or concern. If a change spans packages,
   explain the dependency in the PR description.
2. Conventional Commits (see above). Reference the scope (e.g. `orders`, `mcp`,
   `capi`, `customers`) when it helps.
3. Never commit:
   - `.env`, `.env.local`, or any real secret / API key
   - real personal data (emails, names, phone numbers) in fixtures or docs
   - hardcoded production URLs or domain names — use placeholders + env vars
4. Run `npm test` and the package build before opening the PR.
5. For UI changes, check mobile + desktop and RTL.

---

## Hard rules

1. **No secrets in the repository** — they go in the deployment's environment;
   commit `.example` templates only.
2. **No hardcoded URLs/domains** in source or config. Everything must be swappable
   so a fresh clone can run on its own server.
3. **A CAPI failure can never affect order state.** Analytics stays decoupled
   from business logic.

---

## Getting help

- Start a discussion / open an issue on the repository.
- Read the per-package READMEs: `cod-server/README.md`,
  `cod-client-astro/README.md`, `cod-astro/theme01/THEME_GUIDE.md`, and the
  endpoint docs under `cod-server/src/endpoints/*/README.md`.
- Coding agents should read the repo instructions: `AGENTS.md` (root) and
  `cod-astro/theme01/AGENTS.md` (storefront).

Happy shipping! 🚚