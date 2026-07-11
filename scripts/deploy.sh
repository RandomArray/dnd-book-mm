#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if [[ ! -f .env.prod ]]; then
  echo ".env.prod is missing. Copy .env.prod.example and set secrets first."
  exit 1
fi

COMPOSE_ARGS=(--env-file .env.prod -f docker-compose.prod.yml)

docker compose "${COMPOSE_ARGS[@]}" pull || true
docker compose "${COMPOSE_ARGS[@]}" up -d --build

docker compose "${COMPOSE_ARGS[@]}" ps
