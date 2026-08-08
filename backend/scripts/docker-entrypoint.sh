#!/bin/sh
set -e
echo "Running alembic upgrade head..."
uv run alembic upgrade head
echo "Starting API..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
