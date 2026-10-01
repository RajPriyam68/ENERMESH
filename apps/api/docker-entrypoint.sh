#!/bin/sh
set -eu

SCHEMA="${PRISMA_SCHEMA:-./prisma/schema.prisma}"

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "EnerMesh API: applying Prisma migrations"
  n=0
  until npx prisma migrate deploy --schema "$SCHEMA"; do
    n=$((n + 1))
    if [ "$n" -ge 15 ]; then
      echo "EnerMesh API: migrate deploy failed after ${n} attempts"
      exit 1
    fi
    echo "EnerMesh API: database not ready, retry ${n}/15"
    sleep 2
  done
fi

exec node dist/index.js
