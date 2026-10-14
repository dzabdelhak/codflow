# Custom domains

Every channel has its free address, `<subdomain>.<STORE_BASE_DOMAIN>`. In the
dashboard's **Domains** screen (admins), the merchant can also connect domains
they own. The screen lists every address of the channel with its connection and
HTTPS status.

## Lifecycle

1. **Added: pending.** The merchant types a domain (`boutique.dz`,
   `shop.boutique.dz`; a pasted URL is trimmed to its hostname, IDN is stored
   as punycode). The screen shows the DNS record to create:
   - a subdomain gets a CNAME to `CUSTOM_DOMAIN_TARGET`;
   - a root domain gets A records to `CUSTOM_DOMAIN_IPV4`.

   A pending domain serves nothing. The storefront answers it with 404, and
   Caddy refuses it a certificate.
2. **Verify.** cod-server resolves the domain. It is **verified** when:
   - its CNAME is `CUSTOM_DOMAIN_TARGET`, or
   - one of its A records is in `CUSTOM_DOMAIN_IPV4` or among the target's own
     addresses.

   Otherwise it is **failed**, with the reason shown to the merchant:
   - `no_dns_records`;
   - `points_elsewhere:<values>`;
   - `dns_lookup_failed`;
   - `platform_target_not_configured`.

   "Check again" re-runs the check. A verified domain whose DNS has moved away
   becomes failed and stops being served.
3. **HTTPS.** Nothing to do. On the first HTTPS visit, Caddy asks
   `GET /platform/tls-ask?domain=` (internal only), and cod-server answers 200
   only for a verified domain of a channel that is not archived. Caddy then
   issues the certificate (Let's Encrypt in production, its local CA in
   compose). The screen probes the live certificate through `TLS_PROBE_HOST`.
4. **Primary.** One verified domain per channel is primary: the free address
   at first. The storefront 301-redirects every other address of the channel
   (GET and HEAD, outside previews) to the primary, keeping the path and query.
   Making a domain primary also sets `stores.domain`, and purges the channel's
   cached pages.
5. **Remove.** Any custom domain except the primary. The free address cannot be
   removed.

A hostname belongs to one channel. Another channel can claim it only while the
first claim is unverified and older than 72 hours. A channel holds at most 10
custom domains. Every change is written to the activity log (`domain.*`).

## Settings

On cod-server:

| Variable | Meaning |
|---|---|
| `CUSTOM_DOMAIN_TARGET` | Hostname merchants CNAME their subdomains to (e.g. `stores.codflow.app`). |
| `CUSTOM_DOMAIN_IPV4` | Comma-separated public IPv4 addresses root domains point their A records to. |
| `DNS_SERVERS` | Optional resolvers for the check (default: the system's). |
| `TLS_PROBE_HOST`, `TLS_PROBE_PORT` | Where to reach Caddy to read a domain's certificate (default: the domain itself, 443). |

Caddy:
- Production: `docker/Caddyfile.production.example`. Set `BASE_DOMAIN` and
  `ACME_EMAIL`, keep `/data` on a volume, and keep `/platform/*` off the public
  API host.
- Compose: `docker/Caddyfile` serves HTTPS on `:8443` from Caddy's local CA.

## Trying it locally

`docker compose up` sets `CUSTOM_DOMAIN_IPV4=127.0.0.1`. Any `*.localtest.me`
name resolves to 127.0.0.1 in public DNS, so it verifies for real:

1. Add `boutique.localtest.me` in the Domains screen, then click **Verify**.
2. Open `http://boutique.localtest.me:8090/`, or `https://boutique.localtest.me:8443/`
   (the browser warns about the local CA).
3. Make it primary: `http://shop1.localhost:8090/` now redirects to it.
