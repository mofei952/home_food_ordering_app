#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> backend ruff"
uv run --directory backend ruff check .

echo "==> backend mypy"
uv run --directory backend mypy app

echo "==> backend pytest"
uv run --directory backend pytest tests -v

echo "==> frontend unit tests"
npm --prefix frontend test -- --run

echo "==> frontend production build"
npm --prefix frontend run build

echo "==> frontend e2e (Playwright)"
if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required for Playwright e2e" >&2
  exit 1
fi

has_docker=0
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  has_docker=1
fi

# Default: proven local SQLite e2e. Compose e2e is opt-in (E2E_USE_COMPOSE=1).
# Optional compose smoke: COMPOSE_SMOKE=1 brings up the stack and checks /api/health
# (entrypoint runs alembic upgrade head before uvicorn).
if [[ "${E2E_USE_COMPOSE:-}" == "1" && "$has_docker" -eq 1 ]]; then
  echo "E2E_USE_COMPOSE=1: bringing up compose stack for e2e"
  docker compose up -d --build
  export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:8080}"
  export E2E_SKIP_WEBSERVER=1
  for _ in $(seq 1 90); do
    if curl -fsS "$E2E_BASE_URL/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  curl -fsS "$E2E_BASE_URL/api/health" >/dev/null
  npm --prefix frontend run test:e2e
else
  echo "Running local sqlite e2e stack via Playwright webServer"
  export DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:////tmp/family-menu-e2e.db}"
  export ENVIRONMENT=development
  export IMAGE_STORAGE=memory
  export VITE_E2E_RANDOM_SEED="${E2E_RANDOM_SEED:-42}"
  unset E2E_SKIP_WEBSERVER || true
  unset E2E_BASE_URL || true
  npm --prefix frontend run test:e2e
fi

if [[ "${COMPOSE_SMOKE:-}" == "1" ]]; then
  if [[ "$has_docker" -ne 1 ]]; then
    echo "COMPOSE_SMOKE=1 requested but docker compose is unavailable" >&2
    exit 1
  fi
  echo "==> compose smoke (health after migrate via entrypoint)"
  docker compose up -d --build
  smoke_url="${COMPOSE_SMOKE_URL:-http://127.0.0.1:8080/api/health}"
  for _ in $(seq 1 90); do
    if curl -fsS "$smoke_url" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  curl -fsS "$smoke_url" >/dev/null
  echo "compose smoke OK: $smoke_url"
fi

echo "==> verify.sh OK"
