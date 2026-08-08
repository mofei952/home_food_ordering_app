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

if [[ "${E2E_FORCE_LOCAL:-}" == "1" ]]; then
  has_docker=0
fi

if [[ "$has_docker" -eq 1 ]]; then
  echo "Docker detected: bringing up compose stack for e2e"
  docker compose up -d --build
  export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:8080}"
  export E2E_SKIP_WEBSERVER=1
  # Compose uses Postgres; reset is not needed. Wait for health.
  for _ in $(seq 1 60); do
    if curl -fsS "$E2E_BASE_URL/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  curl -fsS "$E2E_BASE_URL/api/health" >/dev/null
  npm --prefix frontend run test:e2e
else
  echo "Docker not available: running local sqlite e2e stack via Playwright webServer"
  export DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:////tmp/family-menu-e2e.db}"
  export ENVIRONMENT=development
  export IMAGE_STORAGE=memory
  unset E2E_SKIP_WEBSERVER || true
  unset E2E_BASE_URL || true
  npm --prefix frontend run test:e2e
fi

echo "==> verify.sh OK"
