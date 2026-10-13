# Handoff — Aventy store platform (2026-10-13)

## Context
Aventy (ERP) wants a module where each Aventy user creates online stores in one
click (several stores per user, subdomain or own domain). We build it on CodFlow.

## Read first
- `docs/AVENTY-INTEGRATION.md` — Aventy's integration guide = binding contract
- `docs/CAHIER-DES-CHARGES-ZIMOU-MARKET-V2.md` — functional spec (V1 kept for history)
- `docs/adr/0002-aventy-store-platform-scope.md` — scope + 15 product decisions
- `docs/adr/0003-self-hosted-postgres-multi-store.md` — ACCEPTED (Oct 13): self-hosted in
  Algeria, Node.js + PostgreSQL + Row-Level Security, Redis, MinIO, Caddy, Docker

## Branches
- `aventy-platform` — real work (docs + ADRs)
- `spike/multi-store` — throwaway Cloudflare spike (shared D1 vs Durable Object per
  store). Verdict void since we self-host; its leak demo motivates RLS.
- `spike/pg-port` — throwaway D1 → PostgreSQL porting spike (Oct 13). Results in
  `spikes/pg-port-PROTOTYPE/README.md` and in ADR-0003 "Porting spike".

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

## Porting spike — done (Oct 13)
Real cod-shared code runs on Node + PostgreSQL 18 + RLS: hostname routing, product
list, order engine, outbound queue with SKIP LOCKED. All scenarios pass. Full port
estimated at 21–31 working days (tests + Cloudflare services dominate). Runtime
pitfalls to carry into tickets: READ COMMITTED vs D1 serial batches (lock rows in
guarded stock writes), node-postgres numeric strings, constraints only in D1
migrations, scalar `MAX(a,b)` → `GREATEST`, bool `= 1` in `stock.ts`.
Found independently of the runtime: order-number collisions (lost sales) and
refusals on short stock / missing fee grid (against the Aventy guide).

## Next step
1. ~~User confirms ADR-0003~~ — accepted Oct 13.
2. Plan tickets (`to-tickets`) for the port + the two runtime-independent fixes.
