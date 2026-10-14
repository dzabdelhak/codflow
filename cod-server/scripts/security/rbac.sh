#!/usr/bin/env bash
#
# CodFlow RBAC suite — per-domain runner.
#
#   ./rbac.sh list                 show available domains
#   ./rbac.sh orders               run ONE domain (~1 min)
#   ./rbac.sh orders products      several domains, one after another
#   ./rbac.sh all                  every domain sequentially
#   ./rbac.sh --teardown           remove ALL sectest-% rows
#
# Options (env):
#   DATABASE_URL=...   the API's database (default: the compose db, via docker compose exec)
#   MERCHANT_ID=...    merchant the personas join (default: the only merchant)
#   SKIP_SEED=1        personas already in DB, skip seeding step
#   REFRESH_KEYS=1     refetch persona API keys into cache
#   PARALLEL=12        concurrent probes per domain
#   BASE_URL=...       override target (default http://localhost:8787)
set -uo pipefail

SEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SEC_DIR/lib/common.sh"

DOMAINS="public wilayas orders products stock images customers customer-groups customer-tags product-groups drivers delivery-companies driver-payments shipping-profiles admin reviews offers analytics abandoned-orders"
GRAND_PASS=0; GRAND_FAIL=0; FAILED_DOMAINS=""

if [[ "${1:-}" == "--teardown" ]]; then
  echo "Removing sectest-% personas…"
  sec_psql < "$SEC_DIR/teardown-personas.sql" && echo "✓ teardown complete" || echo "✗ teardown failed"
  rm -f "$KEYS_CACHE"
  exit 0
fi

run_one() { # run_one DOMAIN — sources domain file, runs suite, updates grand totals
  local d="$1" file="$SEC_DIR/domains/$d.sh"
  if [[ ! -f "$file" ]]; then echo "✗ unknown domain: $d (try: $0 list)"; return 2; fi
  EP_FILE="$(mktemp)"
  # shellcheck disable=SC1090
  source "$file"
  run_suite "$d"
  GRAND_PASS=$((GRAND_PASS+SUITE_PASS))
  GRAND_FAIL=$((GRAND_FAIL+SUITE_FAIL))
  [[ "$SUITE_FAIL" -gt 0 ]] && FAILED_DOMAINS="$FAILED_DOMAINS $d"
  rm -f "$EP_FILE"; EP_FILE=""
}

cmd="${1:-list}"; shift 2>/dev/null || true

case "$cmd" in
  list)
    echo "Available domains:"
    for d in $DOMAINS; do printf '  %-22s %s\n' "$d" "$(grep -c '^ep ' "$SEC_DIR/domains/$d.sh" 2>/dev/null || echo '?') endpoints"; done
    exit 0 ;;
  all)
    sec_init
    for d in $DOMAINS; do run_one "$d"; done ;;
  *)
    sec_init
    for d in "$cmd" "$@"; do run_one "$d"; done ;;
esac

printf '\n════════════════════════════════════════════════════════════\n'
printf ' TOTAL: \033[32m%d ok\033[0m / \033[31m%d mismatched\033[0m\n' "$GRAND_PASS" "$GRAND_FAIL"
[[ -n "$FAILED_DOMAINS" ]] && printf ' Domains with mismatches:%s\n' "$FAILED_DOMAINS"
printf '════════════════════════════════════════════════════════════\n'
exit $(( GRAND_FAIL > 0 ))
