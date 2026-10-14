# Order protection (anti-flood)

The order form is the public door, so fake and repeated orders are stopped
there (Aventy guide §7).

## Rules

Checked by cod-server when an order arrives (`cod-server/src/endpoints/store/order-flood.ts`),
in this order:

1. **Blocked phone** — the number is on the account's blocklist
   (`blocked_phones`, merchant RLS), shared by every channel of the account.
2. **Same phone, too soon** — the channel already has an order from this phone
   within its window: `stores.order_limit_minutes`, 10 by default, 0 turns it
   off. Set under Settings → Bot protection → Repeat orders.
3. **Same device, too soon** — the same window for the storefront's device id
   (`cod_device` cookie, stored on the order as `device_id` and sent to Aventy
   as `traces.deviceId`).
4. **Too many orders from one address** — at most 20 orders per hour per IP in
   a channel (`ORDER_IP_CEILING_PER_HOUR` on cod-server), wide enough for mobile
   subscribers sharing a carrier address.

The checks run in the order's transaction under a PostgreSQL advisory lock per
phone and per device, so two simultaneous submits cannot both pass.

A blocked attempt **looks exactly like a success**: 201 with an order number
(a real number from the channel's sequence, never reused), so a script learns
nothing. Nothing is created — no order, no customer, no outbound entry, no
conversion. The attempt is written to `blocked_order_attempts` and shown in the
dashboard under **Orders → Blocked attempts**, where the merchant can block the
phone for all channels.

In the browser, the order button locks on the first submit and a second submit
is refused while the first is in flight (`cod-astro/theme01/src/core/order-form/submit-guard.ts`).

## The visitor's IP

Only the address our own front proxy sees counts; `X-Forwarded-For` and other
headers a visitor can write are never read.

- **Caddy** sets `X-Visitor-IP` to `{remote_host}` (the connection's address),
  overwriting anything the visitor sent (`docker/Caddyfile`, and the production
  example).
- **The storefront** reads that header only when `TRUSTED_PROXY_IP_HEADER`
  names it (`x-visitor-ip` in compose); without it, it uses its own
  connection's address (`cod-astro/theme01/src/core/api/visitor-ip.ts`). It
  forwards the result to cod-server as `X-Visitor-IP`.
- **cod-server** reads `X-Visitor-IP` only on `/store/*`, which already
  requires the storefront's service key (`cod-server/src/lib/visitor-ip.ts`).

If another proxy or CDN is ever put in front of Caddy, Caddy's `{remote_host}`
becomes that proxy's address: configure Caddy's `trusted_proxies` for it and
use `{client_ip}` instead.
