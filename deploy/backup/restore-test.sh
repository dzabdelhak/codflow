#!/usr/bin/env bash
# Nightly: restores the latest off-server dump into a throwaway PostgreSQL and
# checks every counted table holds exactly the rows the dump recorded. Fails
# when the dump is older than 30 hours, so a backup that stopped is noticed.
set -euo pipefail
. /opt/codflow/common.sh

WORK=/tmp/restore-test
PORT=5499
cleanup() {
  su-exec postgres pg_ctl -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
fail() { log "restore test failed: $1"; push "$RESTORE_PUSH_TOKEN" down "$1"; cleanup; exit 1; }
trap 'fail "error at line $LINENO"' ERR

cleanup
mkdir -p "$WORK/backup"
started=$(date +%s)

if [ -n "${BACKUP_REMOTE:-}" ]; then
  latest=$(rclone lsf "$BACKUP_REMOTE/daily" --include 'codflow-*.dump' | sort | tail -1)
  [ -n "$latest" ] || fail "no dump in $BACKUP_REMOTE/daily"
  name=${latest%.dump}
  rclone copy "$BACKUP_REMOTE/daily" "$WORK/backup" --include "$name.*"
else
  latest=$(cd "$BACKUP_DIR" 2>/dev/null && printf '%s\n' codflow-*.dump | sort | tail -1 || true)
  [ -f "$BACKUP_DIR/$latest" ] || fail "no dump in $BACKUP_DIR"
  name=${latest%.dump}
  cp "$BACKUP_DIR/$name".* "$WORK/backup/"
fi

(cd "$WORK/backup" && sha256sum -c "$name.sha256" >/dev/null) || fail "$name does not match its checksum"
taken_at=$(sed -n 's/.*"taken_at":"\([^"]*\)".*/\1/p' "$WORK/backup/$name.json")
age_hours=$(( ($(date +%s) - $(date -d "$(echo "$taken_at" | sed 's/T/ /; s/Z//')" +%s)) / 3600 ))
[ "$age_hours" -le 30 ] || fail "latest dump $name is ${age_hours}h old"
expected=$(sed -n 's/.*"counts":\(.*\)}$/\1/p' "$WORK/backup/$name.json")

chown -R postgres "$WORK"
su-exec postgres initdb -D "$WORK/data" -U postgres --auth=trust >/dev/null
su-exec postgres pg_ctl -D "$WORK/data" -o "-c listen_addresses='' -k $WORK -p $PORT" -w start >/dev/null
export PGHOST=$WORK PGPORT=$PORT PGUSER=postgres
unset PGPASSWORD PGDATABASE
psql -qX -d postgres -f "$WORK/backup/$name.globals.sql" >/dev/null 2>&1 || true
createdb -O codflow codflow
pg_restore --exit-on-error -d codflow "$WORK/backup/$name.dump" || fail "pg_restore of $name failed"
restored=$(psql -qAtX -d codflow -c "$COUNT_QUERY")

[ "$restored" = "$expected" ] || fail "$name restored $restored, expected $expected"
took=$(( $(date +%s) - started ))
cleanup
log "restore test of $name passed in ${took}s: $restored"
push "$RESTORE_PUSH_TOKEN" up "$name restored in ${took}s, ${age_hours}h old"
