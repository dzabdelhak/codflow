#!/usr/bin/env bash
# shellcheck disable=SC1091
[ -f /run/codflow-env.sh ] && . /run/codflow-env.sh

BACKUP_DIR=/backups/daily
BACKUP_PUSH_TOKEN=CodflowNightlyBackupPushToken001
RESTORE_PUSH_TOKEN=CodflowRestoreTestPushToken00002
DISK_PUSH_TOKEN=CodflowDiskSpaceCheckPushToken03

log() { echo "[$(date -u +%FT%TZ)] $*"; }

push() { # push TOKEN up|down MESSAGE
  [ -n "${KUMA_PUSH_URL:-}" ] || return 0
  curl -fsS -m 10 -G "$KUMA_PUSH_URL/$1" --data-urlencode "status=$2" --data-urlencode "msg=$3" -o /dev/null \
    || log "could not report to Uptime Kuma"
}

COUNT_QUERY="select json_build_object(
  'merchants', (select count(*) from merchants),
  'stores', (select count(*) from stores),
  'users', (select count(*) from users),
  'products', (select count(*) from products),
  'customers', (select count(*) from customers),
  'orders', (select count(*) from orders),
  'outbound_orders', (select count(*) from outbound_orders),
  'store_domains', (select count(*) from store_domains),
  'migrations', (select count(*) from drizzle.__drizzle_migrations))"
