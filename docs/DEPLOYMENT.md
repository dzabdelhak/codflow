# Production deployment

The platform runs on servers we operate in Algeria (ADR-0003, law 18-07). A
server is installed from this repository and one secrets file. Everything
else is versioned under `deploy/`: images, Caddy, timers, proxy limits and
monitors. Nothing is typed by hand.

```
deploy/
  install.sh            install or upgrade, from the checkout + the secrets file
  compose.yml           the whole stack (one server)
  caddy/Caddyfile       TLS, routing, replicas, request limits
  secrets.env.example   template of /etc/codflow/secrets.env
  backup/               nightly dump, restore test and disk check (cron)
  monitoring/           Uptime Kuma admin setup and monitors (AutoKuma)
```

## What runs

| Service | Role |
|---|---|
| `caddy` | Ports 80/443. HTTPS for `api.`, `app.`, `status.` and every channel hostname, with on-demand Let's Encrypt certificates for verified channel domains only. Spreads requests over the replicas and retries a stopping one |
| `api` ×2 | cod-server. Every replica also runs the outbound order worker, the job worker and the scheduler; row locks and `jobs` dedup keys keep each order and each task to one replica |
| `storefront` ×2 | theme01, every channel |
| `dashboard` ×2 | the merchant dashboard and the OAuth server for MCP |
| `db` | PostgreSQL 18 |
| `redis` | sessions cache, rate limits |
| `objects` | SeaweedFS, the image bucket (S3 API, reached only by the API) |
| `backup` | cron: nightly dump + restore test, disk check |
| `kuma`, `autokuma`, `kuma-setup` | Uptime Kuma at `https://status.BASE_DOMAIN`, its monitors kept equal to `deploy/monitoring/monitors` |
| `setup` | migrations, reference data and legal pages, on every install |

The app containers keep no state of their own (Aventy guide §8): data and
queues live in PostgreSQL, sessions and rate limits in Redis, images in
SeaweedFS. Stopping a replica (`docker stop` on one `api` or `storefront`
container) interrupts neither the storefront nor order transmission. Caddy
moves to the other replica, the outbound worker of the remaining API carries
on, and an order a dying replica held is resent under the same send id.
`APP_REPLICAS` sets the replica count.

## A new server

1. **Server:** Debian or Ubuntu, hosted in Algeria, with Docker Engine and the
   Compose v2 plugin. Open only 22, 80 and 443 (`ufw allow 22,80,443/tcp &&
   ufw allow 443/udp`).
2. **DNS:** point at the server's public IP:
   - `api.BASE_DOMAIN`, `app.BASE_DOMAIN` and `status.BASE_DOMAIN`;
   - `*.BASE_DOMAIN` (free channel addresses);
   - `CUSTOM_DOMAIN_TARGET` (what merchants CNAME their domains to, see
     [CUSTOM-DOMAINS.md](./CUSTOM-DOMAINS.md)).
3. **Code:** check out the release:
   ```sh
   git clone <repo> /srv/codflow && cd /srv/codflow && git checkout <release-tag>
   ```
4. **Secrets:**
   ```sh
   install -m 600 -D deploy/secrets.env.example /etc/codflow/secrets.env
   ```
   Then fill every value (`openssl rand -hex 32` for the secrets). It needs an
   SMTP account for alerts and an rclone remote for off-server backups. Every
   variable is in [CONFIGURATION.md](./CONFIGURATION.md).
5. **Install:**
   ```sh
   sudo deploy/install.sh
   ```
   It checks the secrets file, builds the images of this checkout, starts the
   stack and waits until every service is healthy. On a fresh database it then
   creates the first merchant and its admin (`ADMIN_EMAIL`) and **prints the
   admin's password once**.

Sign in at `https://app.BASE_DOMAIN` and create a channel. Its address
`https://<slug>.BASE_DOMAIN` gets its certificate on the first visit.

## Upgrade and rollback

```sh
cd /srv/codflow && git fetch --tags && git checkout <new-tag> && sudo deploy/install.sh
```

The images are rebuilt and migrations run before the apps start; the apps
are then recreated. Compose replaces a service's replicas together, so an
upgrade can be visible for a few seconds. Caddy holds requests for up to 10
seconds while a replica comes up.

Rollback is the same command with the previous tag. Migrations only go
forward, so rolling back over a release that changed the schema needs that
release's predecessor to accept the new schema, or a restore (below).

## Monitoring and alerts

Uptime Kuma (`https://status.BASE_DOMAIN`, `KUMA_ADMIN_USER`) e-mails
`ALERT_EMAIL_TO` when a monitor turns red:

| Monitor | Red when |
|---|---|
| Platform status | `GET /platform/status` answers 503: database unreachable, an order waiting more than 24 h for transmission, a background job late by 30 min, or a verified channel domain whose certificate is missing, untrusted or expires within 7 days |
| API, Dashboard | `https://api…/health`, `https://app…/sign-in` fail, or their certificate nears expiry |
| Storefront | `/healthz` fails |
| Nightly backup | no successful dump reported for 26 h |
| Nightly restore test | no successful restore reported for 26 h |
| Disk space | the host, Docker or backup disk is above `DISK_ALERT_PERCENT` |

The certificate check runs hourly (`task:check-certificates`, in `jobs`) and
records each domain's result on `store_domains.certificate_*`. Monitors and
the e-mail channel come from `deploy/monitoring/monitors/*.toml`. Change them
there; changes made in Kuma's UI are reset.

Logs: `docker compose -f deploy/compose.yml --env-file /etc/codflow/secrets.env logs -f api`
(rotated, 5 × 20 MB per container).

## Backups

| When (Algeria time) | What |
|---|---|
| 01:30 | `pg_dump` (custom format) of one snapshot, with that snapshot's row counts in a manifest, the roles (`pg_dumpall --globals-only`) and checksums. Copied to `BACKUP_REMOTE/daily` (kept 14 days), on Sundays also to `weekly/` (kept 8 weeks). The image bucket is mirrored to `BACKUP_REMOTE/images`; replaced or deleted images are kept 30 days in `images-replaced/`. The last 3 dumps also stay on the server |
| 03:30 | Restore test: the latest dump is fetched back from `BACKUP_REMOTE`, its checksum verified, then restored into a throwaway PostgreSQL. It must hold exactly the manifest's row counts and be less than 30 h old |

Both report to Uptime Kuma, so a failed or missing run alerts. Run them by
hand with:
`docker compose -f deploy/compose.yml --env-file /etc/codflow/secrets.env exec backup /opt/codflow/backup.sh`
(or `restore-test.sh`).

`BACKUP_REMOTE` must be storage hosted in Algeria. Wrap it in an rclone
`crypt` remote to encrypt the dumps at rest (see `deploy/secrets.env.example`).

### Restoring the platform

On a new server, follow "A new server" up to step 4. Then:

```sh
C="docker compose -f deploy/compose.yml --env-file /etc/codflow/secrets.env"
$C up -d db objects
$C run --rm --no-deps backup sh -c '. /opt/codflow/common.sh && rclone copy "$BACKUP_REMOTE/daily" /backups/restore --include "<name>.*"'
$C run --rm --no-deps backup sh -c 'psql -d postgres -f /backups/restore/<name>.globals.sql; dropdb codflow; createdb codflow && pg_restore --exit-on-error -d codflow /backups/restore/<name>.dump'
$C run --rm --no-deps backup sh -c '. /opt/codflow/common.sh && rclone copy "$BACKUP_REMOTE/images" objects:codflow-images'
sudo deploy/install.sh
```

The globals file reports that the roles already exist; that's expected.
`install.sh` then migrates the restored database forward if the checkout is
newer, and starts everything.

## Growing past one server

Every piece that must be shared already lives outside the app containers. A
second server runs only the `api`, `storefront` and `dashboard` services,
pointed at the first server's `db`, `redis` and `objects` over a private
network. The Caddyfile's `dynamic a` upstreams become a static list of both
servers. The schedulers and workers already coordinate through PostgreSQL.
