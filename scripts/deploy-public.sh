#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f compose.yaml -f compose.public.yaml)
TUNNEL_LOG="${TUNNEL_LOG:-/tmp/family-menu-tunnel.log}"
PUBLIC_URL_FILE="${PUBLIC_URL_FILE:-/tmp/family-menu-public-url.txt}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || return 1
}

install_docker() {
  if need_cmd docker && docker compose version >/dev/null 2>&1; then
    :
  else
    echo "Installing Docker..."
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2
    sudo usermod -aG docker "$USER" 2>/dev/null || true
  fi
  if ! sudo docker info >/dev/null 2>&1; then
    echo "Starting Docker daemon..."
    if ! sudo service docker start 2>/dev/null; then
      sudo dockerd >>/tmp/dockerd.log 2>&1 &
      sleep 3
    fi
  fi
}

install_cloudflared() {
  if need_cmd cloudflared; then
    return 0
  fi
  echo "Installing cloudflared..."
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

wait_compose_health() {
  local i
  for i in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:8080/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Compose stack did not become healthy on :8080" >&2
  "${COMPOSE[@]}" ps
  return 1
}

start_tunnel() {
  pkill -f 'cloudflared tunnel --url http://127.0.0.1:8080' 2>/dev/null || true
  : >"$TUNNEL_LOG"
  nohup cloudflared tunnel --url "http://127.0.0.1:8080" >>"$TUNNEL_LOG" 2>&1 &
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
  echo "Timed out waiting for tunnel URL; see $TUNNEL_LOG" >&2
  tail -20 "$TUNNEL_LOG" >&2 || true
  return 1
}

install_docker
install_cloudflared

if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then
    COMPOSE=(sudo docker compose -f compose.yaml -f compose.public.yaml)
  else
    echo "Docker daemon not available" >&2
    exit 1
  fi
else
  COMPOSE=(docker compose -f compose.yaml -f compose.public.yaml)
fi

# First boot without public MinIO URL (local presign only until tunnel is up).
export S3_PUBLIC_ENDPOINT_URL="${S3_PUBLIC_ENDPOINT_URL:-http://127.0.0.1:9000}"
"${COMPOSE[@]}" up -d --build
wait_compose_health

PUBLIC_URL="$(start_tunnel)"
export S3_PUBLIC_ENDPOINT_URL="$PUBLIC_URL"
"${COMPOSE[@]}" up -d --no-build backend

echo ""
echo "=========================================="
echo "公网访问地址: $PUBLIC_URL"
echo "健康检查:     $PUBLIC_URL/api/health"
echo "隧道日志:     $TUNNEL_LOG"
echo "=========================================="
echo "说明: trycloudflare 临时域名在隧道进程重启后会变化。"
