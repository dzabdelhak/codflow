# 03: Merchant accounts and the channel manager

**What to build:** A merchant signs in to the dashboard (better-auth on PostgreSQL + Redis, dashboard on the Astro Node adapter). A **merchant** owns several stores (channels) and its users; every user of a merchant can open all of its stores with their own role and scopes (per-store permissions can come later). A **dropdown in the top header** lists the merchant's stores (name, status, primary domain) and switches the active one, which stays clearly visible on every screen; every dashboard screen and API call is scoped to the active store and authorised server-side (the store must belong to the user's merchant), so hiding a store in the UI is never the only protection. The same dropdown has a **"Create store"** item (name + subdomain) that creates the store with its free subdomain and legal pages and switches to it. Creation first asks a **plan policy** whether the merchant may have another store — today a store limit on the merchant (empty = unlimited), later Aventy's plan check (ticket 15) behind the same seam. Sign-up stays disabled; accounts are seeded (Aventy SSO arrives in ticket 15).

Decided (Oct 13): `merchants` table (name, store limit) with a merchant id on `users` and `stores` — platform tables outside RLS; Redis via the official `redis` client.

**Blocked by:** 01

**Status:** done

- [x] A seeded merchant signs in and sees only their own stores in the header dropdown
- [x] "Create store" in the dropdown creates a store with its subdomain and legal pages, then switches to it
- [x] Creating a store beyond the merchant's plan limit is refused with a clear message; the plan check is one replaceable seam
- [x] Switching channel changes every screen's data; the active channel's name is always visible
- [x] An API call for a channel the merchant does not own is refused server-side
- [x] Sessions and rate limits live in Redis and survive a restart of any app server
- [x] Auth and dashboard API tests for the touched routes run on PostgreSQL

## Comments

Oct 13 — done (commits 2c5afd7, 711a665, ff47ff0 and the test-port commit).
All 30 parked dashboard test files run on PostgreSQL. Found on the way and
fixed for every caller: the READ COMMITTED oversell in all three guarded stock
writes (FOR UPDATE, with a deterministic test), scalar MAX → GREATEST, the
EXISTS flag kept as 0/1 for the API contract, single-row reads typed
`T | undefined` again (`first`/`one`).
