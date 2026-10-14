#!/usr/bin/env bash
# Nightly: a PostgreSQL dump with the row counts of the same snapshot, copied
# off the server to BACKUP_REMOTE (an rclone remote in Algeria), and the image
# bucket mirrored next to it. Keeps 14 daily and 8 weekly dumps there, 3 here.
set -euo pipefail
. /opt/codflow/common.sh

fail() { log "backup failed: $1"; push "$BACKUP_PUSH_TOKEN" down "$1"; exit 1; }
trap 'fail "error at line $LINENO"' ERR

stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="codflow-$stamp"
mkdir -p "$BACKUP_DIR"
started=$(date +%s)

coproc PSQL { psql -qAtX -v ON_ERROR_STOP=1; }
echo "begin isolation level repeatable read read only; select pg_export_snapshot();" >&"${PSQL[1]}"
read -r snapshot <&"${PSQL[0]}"
echo "$COUNT_QUERY;" >&"${PSQL[1]}"
read -r counts <&"${PSQL[0]}"
pg_dump --format=custom --compress=6 --snapshot="$snapshot" --file "$BACKUP_DIR/$name.dump"
echo "commit;" >&"${PSQL[1]}"
eval "exec ${PSQL[1]}>&-"
wait "$PSQL_PID"

pg_dumpall --globals-only --no-role-passwords > "$BACKUP_DIR/$name.globals.sql"
printf '{"name":"%s","taken_at":"%s","counts":%s}\n' "$name" "$(date -u +%FT%TZ)" "$counts" > "$BACKUP_DIR/$name.json"
(cd "$BACKUP_DIR" && sha256sum "$name.dump" "$name.globals.sql" > "$name.sha256")
size=$(du -h "$BACKUP_DIR/$name.dump" | cut -f1)
find "$BACKUP_DIR" -name 'codflow-*' -mtime +2 -delete

if [ -z "${BACKUP_REMOTE:-}" ]; then
  fail "dump $name ($size) kept on this server only: BACKUP_REMOTE is not set"
fi
rclone mkdir "$BACKUP_REMOTE/daily"
rclone mkdir "$BACKUP_REMOTE/weekly"
rclone mkdir "$BACKUP_REMOTE/images-replaced"
rclone mkdir "$BACKUP_REMOTE/images"
rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE/daily" --include "$name.*"
if [ "$(date -u +%u)" = 7 ]; then
  rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE/weekly" --include "$name.*"
fi
rclone delete "$BACKUP_REMOTE/daily" --min-age 15d
rclone delete "$BACKUP_REMOTE/weekly" --min-age 57d
rclone sync objects:codflow-images "$BACKUP_REMOTE/images" --backup-dir "$BACKUP_REMOTE/images-replaced/$stamp"
rclone delete "$BACKUP_REMOTE/images-replaced" --min-age 31d --rmdirs

took=$(( $(date +%s) - started ))
log "backup $name ($size) copied to $BACKUP_REMOTE in ${took}s: $counts"
push "$BACKUP_PUSH_TOKEN" up "$name $size in ${took}s"
