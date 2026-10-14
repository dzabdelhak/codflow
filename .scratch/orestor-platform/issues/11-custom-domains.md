# 11: Custom domains with automatic HTTPS

**What to build:** In the channel dashboard the merchant adds a domain or subdomain, gets DNS instructions, triggers verification, and sees connection and certificate status and any problem. Caddy issues certificates on demand only for verified domains (it asks the platform before issuing). The merchant picks the primary domain; other domains redirect to it. A typed-in domain never shows as connected before verification succeeds. Domain changes are logged.

**Blocked by:** 04

**Status:** done

- [x] Adding a domain shows DNS instructions and an "en attente" status
- [x] After DNS points to the platform, verification succeeds and HTTPS works without manual steps
- [x] Caddy refuses a certificate for a domain no channel has verified
- [x] Non-primary domains redirect to the primary one
