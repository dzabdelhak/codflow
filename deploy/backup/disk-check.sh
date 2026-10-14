#!/usr/bin/env bash
# Every 10 minutes: the host's disk and Docker's disk (where the backups volume lives).
set -euo pipefail
. /opt/codflow/common.sh

limit=${DISK_ALERT_PERCENT:-85}
report=""
worst=0
for path in /host-root /backups; do
  [ -d "$path" ] || continue
  used=$(df -P "$path" | awk 'NR==2 { gsub("%", "", $5); print $5 }')
  report="$report ${path#/}:${used}%"
  [ "$used" -gt "$worst" ] && worst=$used
done
if [ "$worst" -ge "$limit" ]; then
  push "$DISK_PUSH_TOKEN" down "disk above ${limit}%:$report"
else
  push "$DISK_PUSH_TOKEN" up "disk$report"
fi
