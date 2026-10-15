---
name: codflow-setup
description: >-
  Set up Orestore: run the local stack with Docker Compose, install dependencies,
  run the typecheck and tests (PostgreSQL in Docker), seed a dashboard admin, and
  point to the production install (docs/DEPLOYMENT.md, deploy/install.sh). Use when
  a developer wants to set up, run or test Orestore, or install it on a server.
---

# Orestore Setup

Orestore runs on Node.js + PostgreSQL (Row-Level Security per store), Redis,
SeaweedFS (S3-compatible image storage) and Caddy, all in Docker Compose. Read
`AGENTS.md` for the architecture and `docs/adr/0003-self-hosted-postgres-multi-store.md`
for the decision behind it.

## Prerequisites

Check before starting; stop and tell the developer what is missing.

```bash
node --version            # 22.12+ (the repo's .nvmrc pins 24)
npm --version
docker compose version
```

## 1. Local stack

From the repo root:

```bash
docker compose up --build
```

Compose migrates the database, seeds two demo channels with their legal pages,
seeds the demo admin, and starts the API, storefront, dashboard and Caddy. Then:

- Storefronts: http://shop1.localhost:8090 and http://shop2.localhost:8090
- Dashboard: http://app.localhost:8090 — `admin@example.com`, password
  `COD_ADMIN_PASSWORD` (default `admin-dev-password`)
- API: http://api.localhost:8090

Host ports are overridable (`COD_HTTP_PORT`, `COD_PG_PORT`, `COD_REDIS_PORT`);
the other local defaults are at the top of `docker-compose.yml`.

## 2. Development and tests

```bash
npm ci                          # repo root — one install for every workspace, one lockfile
docker compose up -d db         # PostgreSQL on :5440 — the cod-server tests need it

cd cod-server && npm run typecheck && npm test
cd cod-client-astro && npm run typecheck && npm test
cd cod-astro/theme01 && npx astro check && npm test
```

cod-server tests run on a real PostgreSQL (`src/test-utils/pg.ts`); point them
elsewhere with `TEST_DATABASE_URL`. Never create per-package lockfiles.

To run one package outside Docker:

```bash
cd cod-server && DATABASE_URL=postgres://codflow:codflow@localhost:5440/codflow npm run db:setup   # migrate + demo channels + legal pages
cd cod-server && npm run dev          # :8787 — needs DATABASE_URL, STOREFRONT_SERVICE_KEY, S3_* in the environment
cd cod-client-astro && npm run dev    # :4321 — environment from cod-client-astro/.env.example
```

The dashboard and the storefront both default to port 4321; run one with
`--port 4322`. Every variable is described in `docs/CONFIGURATION.md`.

## 3. Dashboard admin

Sign-up is disabled by design. Create or reset a merchant's admin:

```bash
cd cod-client-astro
DATABASE_URL=postgres://… ADMIN_EMAIL=you@example.com ADMIN_NAME=You \
  npm run seed:admin -- [password] --merchant=<merchant-id>
```

It prints the password (generated when none is given) and an API key. Without
`--merchant`, the database must hold exactly one merchant. The demo merchant is
`demo-merchant`.

## 4. Production server

Follow `docs/DEPLOYMENT.md`: a single server installed with `deploy/install.sh`,
secrets in `/etc/codflow/secrets.env`. `docs/CONFIGURATION.md` lists every
setting. Do not improvise another install path.

## Rules

- Never commit secrets; real values live in the deployment's environment.
- `BETTER_AUTH_SECRET` must be identical on cod-server and the dashboard;
  `STOREFRONT_SERVICE_KEY` on cod-server and the storefront.
- Report each step's result to the developer in plain language, and stop on
  the first failure with the command and its output.
