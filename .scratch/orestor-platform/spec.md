# Orestor platform — running multi-channel platform, ready for Aventy

Oct 13 2026

## Goal

A self-hosted platform (ADR-0003) where a merchant account owns several
**channels** (canaux de vente): an online store or a landing page. Each channel has
its own identity, domain, selected products, delivery modes, design, pixels and
management space (espace de pilotage). It runs on its own today and plugs into
Aventy later without rework.

Sources, in order of precedence:

1. `docs/AVENTY-INTEGRATION.md` — Aventy's integration guide, the binding contract.
2. `docs/ORESTOR-X-AVENTY-1.0.pdf` — functional spec "Orestor X Aventy 1.0".
3. ADR-0002 (scope and product decisions), ADR-0003 (self-hosted PostgreSQL + RLS,
   accepted), the porting spike on branch `spike/pg-port`.

## Decisions

- **The platform replaces Orestore on Cloudflare.** No dual runtime: each ticket
  removes the Cloudflare code it replaces (Workers, D1, R2, KV, Workflows,
  Images, `@astrojs/cloudflare`, `better-auth-cloudflare`).
- **One catalogue per account; channels select from it.** A product can be in the
  catalogue, associated with a channel, published on it, and featured on its
  home page — four distinct states. Hiding a product in one channel never
  changes the catalogue or another channel.
- **Two seams make the platform ready for Aventy:**
  - *Catalogue source* — today the account's own catalogue and delivery grid,
    edited in our dashboard; later Aventy's, pulled by snapshot + changes +
    heartbeat. Copies carry a version so either source fits.
  - *Order destination* — every order is recorded first in a durable outbound
    queue (ULID send id), then delivered to a pluggable destination; today a
    test destination, later Aventy.
- **Channel creation** has an idempotent API. Our creation wizard calls it today;
  Aventy's "Créer un canal de vente" button will call it later through a signed
  token.
- **Store isolation** is PostgreSQL Row-Level Security keyed on the channel
  (ADR-0003); the account layer (accounts, channels, domains, catalogue,
  delivery grid, phone blocklist) sits above it.
- **Orders are never refused** for uncertain stock or a missing fee grid
  (guide rules 1 and 3): "stock non garanti", "frais à confirmer", never 0 DA.
- The MCP server stays, ported off Cloudflare.

## Vocabulary

| Spec (FR) | Here | Note |
|---|---|---|
| canal de vente | channel | Orestore's `store` becomes a channel |
| boutique en ligne | store channel | |
| landing page | landing channel | one main product |
| espace externe de pilotage | channel dashboard | the merchant dashboard, scoped to the active channel |
| gestionnaire de canaux | channel manager | account-level list + selector |

Channel statuses: Brouillon, En configuration, Prêt à publier, Publié, Suspendu,
Archivé. Only a published channel serves its public pages.

## Open

- Who owns a channel's design and sections: our editor (spec 1.0 §6) or Aventy
  through the template manifest (guide §4.4)? Either way the editor writes the
  same versioned section-state document Aventy would send.
- Base domain for free subdomains (not chosen; configurable).
- Aventy API reference, demo store and test keys; signed creation token; SSO.
- Spec 1.0 §18: other channel types in V1; whether a channel shows order statuses.
- Legal (law 18-07): foreign CDN, server-side ad events.

## Out of scope for these tickets

Smart search, AI assistant, visual search (spec phase 3) — planned once the
platform runs.
