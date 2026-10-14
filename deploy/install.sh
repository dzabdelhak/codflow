#!/usr/bin/env bash
# Installs or upgrades the platform on this server from the checked-out
# release and the secrets file alone. Safe to re-run: it rebuilds the images,
# migrates the database and recreates only what changed.
#
#   sudo deploy/install.sh [/etc/codflow/secrets.env]
#
# See docs/DEPLOYMENT.md.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SECRETS=${1:-${CODFLOW_SECRETS:-/etc/codflow/secrets.env}}

die() { echo "✗ $*" >&2; exit 1; }
step() { echo "• $*"; }
secret() { sed -n "s/^$1=//p" "$SECRETS" | tail -1; }

command -v docker >/dev/null || die "Docker is not installed"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"
[ -f "$SECRETS" ] || die "no secrets file at $SECRETS — copy deploy/secrets.env.example there and fill it"
[ "$(stat -c %a "$SECRETS" | cut -c2-)" = "00" ] || die "$SECRETS is readable by other users — chmod 600 $SECRETS"

for key in BASE_DOMAIN ACME_EMAIL MERCHANT_ID MERCHANT_NAME ADMIN_EMAIL POSTGRES_PASSWORD BETTER_AUTH_SECRET \
           STOREFRONT_SERVICE_KEY S3_ACCESS_KEY S3_SECRET_KEY KUMA_ADMIN_PASSWORD ALERT_EMAIL_FROM ALERT_EMAIL_TO SMTP_HOST; do
  [ -n "$(secret "$key")" ] || die "$key is empty in $SECRETS"
done
for key in POSTGRES_PASSWORD BETTER_AUTH_SECRET STOREFRONT_SERVICE_KEY S3_ACCESS_KEY S3_SECRET_KEY; do
  [[ "$(secret "$key")" =~ ^[A-Za-z0-9_-]{24,}$ ]] || die "$key must be at least 24 letters, digits, - or _ (openssl rand -hex 32)"
done
for key in AVENTY_KEY_ENCRYPTION_KEY AVENTY_KEY_ENCRYPTION_KEY_PREVIOUS; do
  value=$(secret "$key")
  [ -z "$value" ] || [[ "$value" =~ ^[0-9a-fA-F]{64}$ ]] || [ "$(printf '%s' "$value" | base64 -d 2>/dev/null | wc -c)" = 32 ] \
    || die "$key must be 32 bytes, as 64 hex characters or base64 (openssl rand -hex 32)"
done
[ "$(secret BASE_DOMAIN)" != "example.dz" ] || [ "$(secret CADDY_GLOBAL_EXTRA)" = "local_certs" ] \
  || die "BASE_DOMAIN is still the example value"
[ -n "$(secret BACKUP_REMOTE)" ] || echo "! BACKUP_REMOTE is empty: dumps stay on this server and the backup monitor stays red"

CODFLOW_BACKUP_ENV="$(dirname "$SECRETS")/backup.env"
(umask 077 && { grep -E '^RCLONE_CONFIG_[A-Z0-9_]+=' "$SECRETS" || true; } > "$CODFLOW_BACKUP_ENV")
export CODFLOW_BACKUP_ENV
CODFLOW_RELEASE=$(git -C "$REPO" describe --tags --always --dirty 2>/dev/null || echo latest)
export CODFLOW_RELEASE
compose() { docker compose -f "$REPO/deploy/compose.yml" --env-file "$SECRETS" "$@"; }

step "Building release $CODFLOW_RELEASE"
compose build --pull

step "Starting the platform"
compose up -d --remove-orphans --wait --wait-timeout 600
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

step "Removing images of earlier releases"
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^codflow/(api|storefront|dashboard|backup):' \
  | awk -F: -v release="$CODFLOW_RELEASE" '$2 != release' | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null

step "Checking the first account"
merchant=$(secret MERCHANT_ID)
compose exec -T db psql -U codflow -d codflow -qAtX -v ON_ERROR_STOP=1 \
  -v id="$merchant" -v name="$(secret MERCHANT_NAME)" <<'SQL'
insert into merchants (id, name, created_at)
values (:'id', :'name', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
on conflict (id) do nothing;
SQL
users=$(compose exec -T db psql -U codflow -d codflow -qAtX -v id="$merchant" <<'SQL'
select count(*) from users where merchant_id = :'id';
SQL
)
if [ "$users" = "0" ]; then
  step "Creating the admin $(secret ADMIN_EMAIL) — keep the password printed below"
  compose run --rm --no-deps -e ADMIN_EMAIL="$(secret ADMIN_EMAIL)" dashboard node scripts/seed-admin.mjs --merchant="$merchant"
fi

domain=$(secret BASE_DOMAIN)
step "Release $CODFLOW_RELEASE is running"
compose ps --format 'table {{.Service}}\t{{.Status}}'
cat <<EOF

  Dashboard   https://app.$domain
  API         https://api.$domain
  Monitoring  https://status.$domain  (user $(secret KUMA_ADMIN_USER))
  Channels    https://<slug>.$domain and the merchants' own domains
EOF
