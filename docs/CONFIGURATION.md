# Configuration reference

Every setting is an environment variable. Each environment sets them in its
own place:

- **Production:** one secrets file, `/etc/codflow/secrets.env` (template
  `deploy/secrets.env.example`). `deploy/compose.yml` derives each app's
  variables from it. See [DEPLOYMENT.md](./DEPLOYMENT.md).
- **Local stack:** `docker-compose.yml` at the repo root, with local defaults.
- **One app run by hand:** export the variables below. The dashboard's template
  is `cod-client-astro/.env.example`.

Secrets live only in the environment, never in the repository.

## Production secrets file

| Variable | Meaning |
|---|---|
| `BASE_DOMAIN` | `api.`, `app.` and `status.` hosts, and the free channel addresses `<slug>.BASE_DOMAIN` |
| `ACME_EMAIL` | Let's Encrypt account |
| `CUSTOM_DOMAIN_TARGET`, `CUSTOM_DOMAIN_IPV4` | What a merchant's own domain must point at (CNAME, or A records) |
| `MERCHANT_ID`, `MERCHANT_NAME`, `ADMIN_EMAIL` | First account, created once by `install.sh` |
| `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `STOREFRONT_SERVICE_KEY`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Application secrets: `openssl rand -hex 32` |
| `ORDER_DESTINATION` | Where orders are transmitted (`test` until the Aventy connector) |
| `KUMA_ADMIN_USER`, `KUMA_ADMIN_PASSWORD` | Uptime Kuma login |
| `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Where alerts are e-mailed (STARTTLS, usually port 587) |
| `DISK_ALERT_PERCENT` | Disk use that turns the disk monitor red (default 85) |
| `BACKUP_REMOTE`, `RCLONE_CONFIG_BACKUP_*` | The off-server backup destination, as an rclone remote |
| `APP_REPLICAS` | Replicas of each app (default 2) |
| `CADDY_GLOBAL_EXTRA` | `local_certs` for a rehearsal without public DNS; empty in production |

## cod-server (API)

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL, as the database owner; the app switches to `codflow_app` / `codflow_platform` per pool |
| `PUBLIC_API_URL` | yes | The API's public origin: OpenAPI server, webhook and image URLs, MCP token audience (`<it>/mcp`) |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes | Image storage; `S3_BUCKET` (default `codflow-images`), `S3_REGION` optional |
| `BETTER_AUTH_URL` | yes | The dashboard's origin; dashboard sessions and MCP tokens are verified against its JWKS |
| `BETTER_AUTH_JWKS_URL` | | The JWKS as reachable from the API (in Docker `http://dashboard:4321/api/auth/jwks`) |
| `BETTER_AUTH_SECRET` | yes | Identical on the dashboard |
| `STOREFRONT_SERVICE_KEY` | yes | Shared with the storefront; only with it is `X-Channel-Host` trusted |
| `REDIS_URL` | | Rate limits (MCP, storefront OTP) and MCP last-used times; everything still serves without it |
| `ALLOWED_ORIGINS` | | Comma-separated CORS origins (the dashboard) |
| `STORE_BASE_DOMAIN` | | Free channel addresses are `<slug>.<it>` (default `localhost`) |
| `CUSTOM_DOMAIN_TARGET`, `CUSTOM_DOMAIN_IPV4` | | Where merchants' own domains must point ([CUSTOM-DOMAINS.md](./CUSTOM-DOMAINS.md)) |
| `TLS_PROBE_HOST`, `TLS_PROBE_PORT` | | Where channel certificates are probed (Caddy); without it, the hourly certificate check is off |
| `DNS_SERVERS` | | Comma-separated resolvers for domain verification |
| `STOREFRONT_INTERNAL_URL` | | Storefront(s) to purge cached pages on; every address a name resolves to is purged, comma-separate several names |
| `IMAGES_PUBLIC_URL` | | Public base of `/images` (default: request origin + `/images`) |
| `STOREFRONT_URL` | | Fallback origin for landing-page share links |
| `ORDER_DESTINATION` | | `test` (default) — see [ORDER-TRANSMISSION.md](./ORDER-TRANSMISSION.md) |
| `OUTBOUND_SENDERS`, `OUTBOUND_SEND_TIMEOUT_MS`, `OUTBOUND_MAX_DELAY_MS`, `OUTBOUND_HOLD_ATTEMPTS` | | Outbound worker tuning |
| `ORDER_IP_CEILING_PER_HOUR` | | Anti-flood per-IP ceiling (default 20) — [ORDER-PROTECTION.md](./ORDER-PROTECTION.md) |
| `ENVIRONMENT` | | `production` requires channel certificates to be publicly trusted |
| `PORT` | | Default 8787 |

## cod-client-astro (dashboard)

| Variable | When | Meaning |
|---|---|---|
| `PUBLIC_API_URL` | build | The API origin, inlined into the browser bundle: changing it needs a rebuild (the Docker image takes it as a build arg). On `app.<domain>` the browser derives `api.<domain>` itself |
| `DATABASE_URL` | run | Same database as the API; the auth server reads identity tables only |
| `REDIS_URL` | run | better-auth's secondary storage and rate limits, MCP channel choices |
| `PUBLIC_APP_URL` | run | This dashboard's origin: better-auth base URL and OAuth issuer (`<it>/api/auth`) |
| `PUBLIC_TRUSTED_ORIGINS` | run | Extra origins allowed to call `/api/auth/*` |
| `BETTER_AUTH_SECRET` | run | Identical on the API |

## cod-astro/theme01 (storefront)

| Variable | Meaning |
|---|---|
| `COD_SERVER_URL` | The API as reachable from the storefront (`http://api:8787` in Docker) |
| `STOREFRONT_SERVICE_KEY` | Identical on the API; server-side only |
| `MEDIA_URL` | Public base of the API's `/images` |
| `TRUSTED_PROXY_IP_HEADER` | The header Caddy sets with the visitor's IP (`x-visitor-ip`); the storefront must be reachable only through Caddy |

## Health and status endpoints

| Endpoint | Answers |
|---|---|
| `GET /health` (API) | `{"status":"ok"}` while the process runs |
| `GET /platform/status` (API, private) | 200 or 503 with the database, outbound queue (an order waiting > 24 h), job backlog (> 30 min) and channel certificate checks; Caddy refuses `/platform/*` from outside |
| `GET /healthz` (storefront) | `ok`, without resolving a channel |
| `GET /sign-in` (dashboard) | the prerendered sign-in page |
