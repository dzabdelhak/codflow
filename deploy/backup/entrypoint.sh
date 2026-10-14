#!/bin/sh
set -e
export -p > /run/codflow-env.sh
chmod 600 /run/codflow-env.sh
exec "$@"
