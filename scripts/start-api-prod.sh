#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example and set production secrets before starting."
  exit 1
fi

echo "PeerMatch API: applying Prisma migrations"
npm run db:deploy

echo "PeerMatch API: starting production server"
exec npm run start:api
