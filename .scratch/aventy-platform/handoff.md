# Handoff — Aventy store platform (2026-10-13)

## Context
Aventy (ERP) wants a module where each Aventy user creates online stores in one
click (several stores per user, subdomain or own domain). We build it on CodFlow.

## Read first
- `docs/AVENTY-INTEGRATION.md` — Aventy's integration guide = binding contract
- `docs/CAHIER-DES-CHARGES-ZIMOU-MARKET-V2.md` — functional spec (V1 kept for history)
- `docs/adr/0002-aventy-store-platform-scope.md` — scope + 15 product decisions
- `docs/adr/0003-self-hosted-postgres-multi-store.md` — PROPOSED: self-hosted in
  Algeria, Node.js + PostgreSQL + Row-Level Security, Redis, MinIO, Caddy, Docker

## Branches
- `aventy-platform` — real work (docs + ADRs)
- `spike/multi-store` — throwaway Cloudflare spike (shared D1 vs Durable Object per
  store). Verdict void since we self-host; its leak demo motivates RLS.

## Decisions since ADR-0002
- Own servers, because customer data must stay in Algeria (law 18-07) + cost/control
- External SaaS OK for non-sensitive parts; a foreign CDN in front of the storefront
  needs Aventy legal approval first (TLS terminates abroad)
- Keep TypeScript; we operate the servers ourselves

## Open with Aventy
- Signed redirect token (one-click creation) and SSO login
- API reference, demo store + test keys
- Do Aventy's current landing pages support offers?
- Legal: CDN and server-side Meta/TikTok events under law 18-07

## Next step
Porting spike: move one vertical slice (store by hostname → product list → order
into the outbound Aventy queue) to Node.js + PostgreSQL with RLS, measure the D1 →
PostgreSQL effort, then confirm ADR-0003 and plan tickets.
