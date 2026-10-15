# cod-client-astro

The Orestore merchant dashboard, built with Astro 7 as a prerendered static app
served by Astro's Node adapter. Pages carry no data; the server routes are
`/api/auth/*` (better-auth), the OAuth discovery documents, the MCP channel
choice, password reset and the SPA fallback.

Read before contributing:

- `CONTEXT.md` — domain vocabulary (Shell / Island / Identity / API seam / Auth
  surface) and boundaries.
- `DESIGN.md` — the design system (tokens, shell layout, migration rules).

## Scripts

```sh
npm run dev            # astro dev on :4321
npm run build          # prerender → dist/ (+ Node server entry for the server routes)
npm start              # node ./dist/server/entry.mjs
npm run typecheck      # astro check
npm test               # vitest (unit: gate logic)
npm run verify-shells  # fail if shells leak data or reference legacy domains
npm run seed:admin     # create/rotate a merchant's admin (DATABASE_URL, -- --merchant=<id>)
npm run smoke          # live auth/API gate suite (needs DASH_URL/API_URL/SMOKE_*)
```

Install/build always happens from the **repo root** (`npm ci` / `npm install`) —
single root lockfile.

## Get running locally

The whole stack runs with `docker compose up --build` at the repo root
(dashboard at http://app.localhost:8090, `admin@example.com` /
`admin-dev-password`). To run this package alone, repo root `npm ci` done:

```sh
# 1. PostgreSQL + Redis, then migrate + seed the demo channels
docker compose up -d db redis
cd ../cod-server && DATABASE_URL=postgres://codflow:codflow@localhost:5440/codflow npm run db:setup

# 2. This package: environment
cd ../cod-client-astro
cp .env.example .env                     # set BETTER_AUTH_SECRET (same as cod-server's)
set -a; . ./.env; set +a                 # the server routes read process.env

# 3. Create your admin (sign-up is disabled by design — admins are provisioned)
DATABASE_URL=postgres://codflow:codflow@localhost:5440/codflow npm run seed:admin -- --merchant=demo-merchant
#    → prints email + generated password + API key; save them

# 4. Run the servers (two terminals)
npm run dev              # dashboard → http://localhost:4321
cd ../cod-server && npm run dev   # API → http://localhost:8787
```

Sign in at `http://localhost:4321/sign-in` with the seeded credentials.

## Environment contract

`.env.example` lists every variable:

| When | Variable | Purpose |
|---|---|---|
| build time (client) | `PUBLIC_API_URL` | backend origin used by `src/lib/api.ts` |
| run time | `DATABASE_URL` | the platform PostgreSQL (same database as cod-server) |
| run time | `REDIS_URL` | better-auth secondary storage and rate limits |
| run time | `PUBLIC_APP_URL` | better-auth base URL (JWT issuer) |
| run time | `PUBLIC_TRUSTED_ORIGINS` | extra origins allowed to POST to `/api/auth/*` |
| run time | `BETTER_AUTH_SECRET` | must be identical on cod-server |

`PUBLIC_API_URL` is inlined into the browser bundle by `astro:env/client`, so
changing it needs a rebuild (the Docker image takes it as a build arg). On
`app.<domain>` the browser derives the API as `api.<domain>`.

The dashboard reads identity tables (users, accounts, sessions) in the same
PostgreSQL as cod-server for sign-in; business data comes only through the API.

Client bundles must never contain secrets or the legacy dashboard domain —
`verify-shells.mjs` enforces both at build time.

## Architecture in one paragraph

Every page is a prerendered Shell that ships zero data. Its root island mounts
`RequireAuth`, which checks the session (silent spinner at most) and either
redirects to `/sign-in?next=…` or reveals the page inside
`DashboardChrome`. Data flows through the API seam (`src/lib/api.ts`) using a
short-lived JWT (`set-auth-jwt`) that `cod-server` verifies offline against the
better-auth JWKS — authorization therefore lives entirely in cod-server, where
it is tested (`cod-server/scripts/security/rbac.sh`).
