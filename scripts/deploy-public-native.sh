#!/usr/bin/env bash
# 宿主机部署 + Cloudflare 临时隧道（Cloud Agent 无入站端口、Docker 桥接异常时使用）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$PATH"
DATA_DIR="${DATA_DIR:-/tmp/family-menu-data}"
MINIO_DIR="$DATA_DIR/minio"
DB_FILE="${DB_FILE:-/tmp/family-menu-prod.db}"
CADDYFILE="$ROOT/deploy/Caddyfile.host"
TUNNEL_LOG="${TUNNEL_LOG:-/tmp/family-menu-tunnel.log}"
PUBLIC_URL_FILE="${PUBLIC_URL_FILE:-/tmp/family-menu-public-url.txt}"
LISTEN_PORT="${LISTEN_PORT:-8080}"

need_cmd() { command -v "$1" >/dev/null 2>&1; }

install_uv() {
  if need_cmd uv; then return 0; fi
  curl -fsSL https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
}

install_cloudflared() {
  if need_cmd cloudflared; then return 0; fi
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch=amd64 ;;
    aarch64) arch=arm64 ;;
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
  esac
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}" -o /tmp/cloudflared
  chmod +x /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
}

install_minio_mc() {
  if [[ -x "$DATA_DIR/bin/minio" && -x "$DATA_DIR/bin/mc" ]]; then
    return 0
  fi
  mkdir -p "$DATA_DIR/bin"
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch=amd64 ;;
    aarch64) arch=arm64 ;;
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
  esac
  curl -fsSL "https://dl.min.io/server/minio/release/linux-${arch}/minio" -o "$DATA_DIR/bin/minio"
  curl -fsSL "https://dl.min.io/client/mc/release/linux-${arch}/mc" -o "$DATA_DIR/bin/mc"
  chmod +x "$DATA_DIR/bin/minio" "$DATA_DIR/bin/mc"
}

install_caddy() {
  if need_cmd caddy; then return 0; fi
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
}

stop_previous() {
  pkill -f 'cloudflared tunnel --url' 2>/dev/null || true
  pkill -f "$DATA_DIR/bin/minio server" 2>/dev/null || true
  pkill -f 'uvicorn app.main:app' 2>/dev/null || true
  sudo pkill -f "caddy run --config $CADDYFILE" 2>/dev/null || true
  sleep 1
}

write_caddyfile() {
  cat >"$CADDYFILE" <<EOF
:${LISTEN_PORT} {
  handle /api/* {
    reverse_proxy 127.0.0.1:8000
  }
  handle /family-menu/* {
    reverse_proxy 127.0.0.1:9000
  }
  handle {
    root * ${ROOT}/frontend/dist
    try_files {path} /index.html
    file_server
  }
}
EOF
}

start_minio() {
  mkdir -p "$MINIO_DIR"
  export MINIO_ROOT_USER=minioadmin
  export MINIO_ROOT_PASSWORD=minioadmin
  nohup "$DATA_DIR/bin/minio" server "$MINIO_DIR" --address "127.0.0.1:9000" --console-address "127.0.0.1:9001" \
    >>"$DATA_DIR/minio.log" 2>&1 &
  local i
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:9000/minio/health/live" >/dev/null 2>&1; then
      "$DATA_DIR/bin/mc" alias set local http://127.0.0.1:9000 minioadmin minioadmin
      "$DATA_DIR/bin/mc" mb --ignore-existing local/family-menu
      return 0
    fi
    sleep 1
  done
  echo "MinIO failed to start; see $DATA_DIR/minio.log" >&2
  return 1
}

start_backend() {
  local public_origin="${1:-http://127.0.0.1:9000}"
  cd "$ROOT/backend"
  uv sync --frozen 2>/dev/null || uv sync
  DATABASE_URL="sqlite+aiosqlite:///${DB_FILE}" \
  IMAGE_STORAGE=s3 \
  ENVIRONMENT=production \
  SECURE_COOKIES=true \
  TRUSTED_PROXY_HEADERS=true \
  S3_ENDPOINT_URL=http://127.0.0.1:9000 \
  S3_PUBLIC_ENDPOINT_URL="$public_origin" \
  S3_ACCESS_KEY=minioadmin \
  S3_SECRET_KEY=minioadmin \
  S3_BUCKET=family-menu \
  S3_REGION=us-east-1 \
  uv run python scripts/reset_sqlite_schema.py
  DATABASE_URL="sqlite+aiosqlite:///${DB_FILE}" \
  IMAGE_STORAGE=s3 \
  ENVIRONMENT=production \
  SECURE_COOKIES=true \
  TRUSTED_PROXY_HEADERS=true \
  S3_ENDPOINT_URL=http://127.0.0.1:9000 \
  S3_PUBLIC_ENDPOINT_URL="$public_origin" \
  S3_ACCESS_KEY=minioadmin \
  S3_SECRET_KEY=minioadmin \
  S3_BUCKET=family-menu \
  S3_REGION=us-east-1 \
  nohup uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 >>"$DATA_DIR/backend.log" 2>&1 &
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Backend failed; see $DATA_DIR/backend.log" >&2
  return 1
}

build_frontend() {
  cd "$ROOT/frontend"
  npm ci
  npm run build
}

start_caddy() {
  write_caddyfile
  sudo caddy run --config "$CADDYFILE" --adapter caddyfile >>"$DATA_DIR/caddy.log" 2>&1 &
  for i in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:${LISTEN_PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Caddy failed; see $DATA_DIR/caddy.log" >&2
  return 1
}

start_tunnel() {
  : >"$TUNNEL_LOG"
  nohup cloudflared tunnel --url "http://127.0.0.1:${LISTEN_PORT}" >>"$TUNNEL_LOG" 2>&1 &
  local i url
  for i in $(seq 1 60); do
    url="$(rg -o 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
    if [[ -n "$url" ]]; then
      echo "$url" >"$PUBLIC_URL_FILE"
      printf '%s\n' "$url"
      return 0
    fi
    sleep 1
  done
  tail -20 "$TUNNEL_LOG" >&2 || true
  return 1
}

install_uv
install_cloudflared
install_minio_mc
install_caddy
stop_previous
build_frontend
start_minio
start_backend "http://127.0.0.1:9000"
start_caddy

PUBLIC_URL="$(start_tunnel)"
pkill -f 'uvicorn app.main:app' 2>/dev/null || true
sleep 1
start_backend "$PUBLIC_URL"

echo ""
echo "=========================================="
echo "公网访问: $PUBLIC_URL"
echo "健康检查: $PUBLIC_URL/api/health"
echo "数据目录: $DATA_DIR"
echo "=========================================="
echo "说明: 隧道域名在 cloudflared 重启后会变化；Agent 关机后服务停止。"
