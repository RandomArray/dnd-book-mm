#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if [[ ! -f .env.prod ]]; then
  echo ".env.prod is missing. Copy .env.prod.example and set secrets first."
  exit 1
fi

docker compose -f docker-compose.prod.yml pull || true
docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml ps
