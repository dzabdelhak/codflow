# theme01 — Orestore Storefront

The default storefront theme for Orestore: a mobile-first, multi-locale,
conversion-focused **Astro 7** storefront that talks to the Orestore backend
(`cod-server`) over the public `/store/*` API.

theme01 is part of the [Orestore monorepo](../../README.md). It is one of three
apps that make up the platform:

| App | Role |
|-----|------|
| `cod-server` | Backend engine — REST API, `/store/*` storefront API, webhooks, MCP |
| `cod-client-astro` | Merchant dashboard (Astro) |
| `cod-astro/theme01` | **Storefront — this package** |

## What it does

- Product catalog: home, listing, category, and product-detail pages
- COD order form with a wilaya-based shipping calculator, variant + offer support
- Product reviews (submitted and read through `cod-server`)
- Abandoned-order tracking (`POST /store/abandoned`) with the Meta Pixel
- Three locale packs: **Arabic, French, English** (RTL-first, default Arabic)
- Partner-overridable design tokens (colors, font) injected at request time
- Resized images from cod-server's `/images/<key>?w=` widths (`MEDIA_URL`)

## Quick start

Prereqs: Node 22.12+ and a running `cod-server` (the storefront reads all
data from its `/store/*` API). The whole stack, with two demo channels, is
`docker compose up --build` at the repo root.

```bash
npm ci                           # at the repo root — installs all workspaces
cd cod-astro/theme01
STOREFRONT_SERVICE_KEY=… COD_SERVER_URL=http://localhost:8787 npm run dev
```

The channel is picked from the hostname: open `http://shop1.localhost:4321`
for a channel whose hostname is `shop1.localhost`.

> The storefront expects `cod-server` to be running on `http://localhost:8787`
> (the default `COD_SERVER_URL`). See the [monorepo README](../../README.md#getting-started)
> to bring up the backend and seed a demo store.

## Environment variables

Defined in `astro.config.mjs` → `env.schema`, read from the environment.

| Variable | Required | Purpose |
|----------|----------|---------|
| `STOREFRONT_SERVICE_KEY` | yes | Shared secret sent as `X-Storefront-Key`; must match cod-server's. With it, cod-server trusts the visitor hostname sent as `X-Channel-Host`. |
| `COD_SERVER_URL` | yes | Base URL of `cod-server` (dev: `http://localhost:8787`). |
| `MEDIA_URL` | no | cod-server's public `/images` base (e.g. `https://api.example.com/images`). Images under it are requested at a fixed width with `?w=`. Unset → the image optimizer passes original URLs through unchanged. |

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Astro dev server on `http://localhost:4321` |
| `npm run build` | Production build (`astro build`) |
| `npm start` | Run the production build (`node dist/server/entry.mjs`) |
| `npm test` | Vitest unit/property tests (`fast-check`) |
| `npm run validate:strings` | Check for hardcoded user-facing strings in components |
| `npm run validate:styles` | Check for hardcoded colors/radii/fonts in component styles |
| `npm run validate:all` | Both validators, then `astro build` |

## Project structure

```
src/
├── core/                # Platform-owned engine — DO NOT MODIFY
│   ├── actions/         #   placeOrder action (Zod validation + API call)
│   ├── api/             #   client.ts, types.ts, validation.ts
│   ├── data/            #   wilayas.ts (58 wilayas)
│   ├── endpoints/       #   communes, product-reviews, submit-review
│   ├── middleware.ts    #   POST/Redirect/GET handler for Astro actions
│   └── utils/           #   image-optimizer.ts (`?w=` widths from cod-server's /images)
├── theme/               # Theme layer — everything customizable
│   ├── components/      #   home/, layout/, order/, product/, products/, category/, ui/
│   ├── content/         #   types.ts + ar.ts / fr.ts / en.ts (all UI strings)
│   ├── config/          #   store.ts (DEFAULT_CONFIG + getStoreContext)
│   ├── layouts/         #   StoreLayout.astro
│   ├── scripts/         #   product.ts, track-abandonment.ts (+ property tests)
│   ├── styles/          #   global.css (design tokens)
│   └── utils/           #   seo.ts
├── actions/             # Proxy → re-exports src/core/actions
├── middleware.ts        # Proxy → re-exports src/core/middleware
├── content.config.ts    # Build-time collections (empty — data is fetched at request time)
└── pages/               # index, products/, category/, thank-you, api/*
```

See [THEME_GUIDE.md](./THEME_GUIDE.md) for the two hard rules (no hardcoded
strings, no hardcoded design tokens), the design system, and the full component
inventory.

## Deployment

`npm run build` produces a standalone Node server (`dist/server/entry.mjs`);
`docker/storefront.Dockerfile` at the repo root packages it. Run it with
`COD_SERVER_URL`, `STOREFRONT_SERVICE_KEY` (and optionally `MEDIA_URL`) in
the environment, behind the front proxy that routes every channel hostname to
it (`docker/Caddyfile`).

## Documentation

- **[`THEME_GUIDE.md`](./THEME_GUIDE.md)** — design system, hard rules, component
  inventory, production gotchas, contributor briefing
- **[`CONTENT_KEYS_REFERENCE.md`](./CONTENT_KEYS_REFERENCE.md)** — all storefront
  content keys (155) grouped by section
- **[`src/core/README.md`](./src/core/README.md)** — the platform-owned engine
- **[`src/theme/README.md`](./src/theme/README.md)** — customizing the theme layer
- **[`lighthouse-tests/README.md`](./lighthouse-tests/README.md)** — optional
  Lighthouse performance/accessibility suite