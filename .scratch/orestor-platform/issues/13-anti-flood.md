# 13: Anti-flood protection on the order form

**What to build:** Following guide §7: the order button locks on first click with a guard against a second submit; one order per phone or device every 10 minutes by default, adjustable per channel; a wide per-IP ceiling read only from the address our own front proxy sees, never from a client-writable header. A blocked attempt sees the same "commande reçue" screen, creates nothing, and is logged for the merchant. The phone blocklist is shared across an account's channels.

**Blocked by:** 02

**Status:** done

- [x] A second order from the same phone within 10 minutes shows success but creates nothing and appears in the blocked-attempts log
- [x] Forging X-Forwarded-For does not change the IP the limit uses
- [x] A phone blocked in one channel is blocked in the account's other channels
