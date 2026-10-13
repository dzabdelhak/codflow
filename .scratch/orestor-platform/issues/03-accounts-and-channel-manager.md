# 03: Merchant accounts and the channel manager

**What to build:** A merchant signs in to the dashboard (better-auth on PostgreSQL + Redis, dashboard on the Astro Node adapter). The account level lists the merchant's channels — name, type, status, primary domain, avatar — with search and filters by type and status. A selector in the header switches the active channel, which stays clearly visible on every screen; every dashboard screen and API call is scoped to the active channel and authorised server-side, so hiding a channel in the UI is never the only protection. Sign-up stays disabled; accounts are seeded (Aventy SSO arrives in ticket 15).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A seeded merchant signs in and sees only their own channels
- [ ] Switching channel changes every screen's data; the active channel's name is always visible
- [ ] An API call for a channel the merchant does not own is refused server-side
- [ ] Sessions and rate limits live in Redis and survive a restart of any app server
- [ ] Auth and dashboard API tests for the touched routes run on PostgreSQL
