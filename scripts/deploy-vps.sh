#!/usr/bin/env bash
# 在云主机上长期部署家庭点菜（Docker Compose + 持久卷）
# 可在本机执行（需 SSH），或登录服务器后在仓库根目录执行。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PUBLIC_HOST="${PUBLIC_HOST:-139.196.83.119}"
PUBLIC_PORT="${PUBLIC_PORT:-18080}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://${PUBLIC_HOST}:${PUBLIC_PORT}}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-family-menu}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.vps}"

export PUBLIC_HOST PUBLIC_PORT PUBLIC_BASE_URL COMPOSE_PROJECT_NAME

need_cmd() { command -v "$1" >/dev/null 2>&1; }

install_docker() {
  if need_cmd docker && docker compose version >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing Docker Engine + Compose plugin..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl gnupg
  if ! need_cmd docker; then
    curl -fsSL https://get.docker.com | sudo sh
  fi
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  if ! sudo docker info >/dev/null 2>&1; then
    sudo service docker start 2>/dev/null || sudo systemctl start docker
  fi
}

write_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    echo "复用已有环境文件: $ENV_FILE"
    return 0
  fi
  cat >"$ENV_FILE" <<EOF
PUBLIC_HOST=${PUBLIC_HOST}
PUBLIC_PORT=${PUBLIC_PORT}
PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
EOF
  echo "已写入 $ENV_FILE"
}

compose() {
  local -a cmd=(docker compose --env-file "$ENV_FILE" -f compose.yaml -f compose.vps.yaml)
  if ! docker info >/dev/null 2>&1; then
    cmd=(sudo docker compose --env-file "$ENV_FILE" -f compose.yaml -f compose.vps.yaml)
  fi
  "${cmd[@]}" "$@"
}

wait_health() {
  local url="$PUBLIC_BASE_URL/api/health"
  local i
  for i in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "健康检查失败: $url" >&2
  compose ps >&2 || true
  compose logs --tail=80 backend caddy >&2 || true
  return 1
}

install_systemd_unit() {
  local unit=/etc/systemd/system/family-menu.service
  if [[ "${INSTALL_SYSTEMD:-1}" != "1" ]]; then
    return 0
  fi
  if ! need_cmd systemctl; then
    echo "跳过 systemd（未找到 systemctl）"
    return 0
  fi
  sudo tee "$unit" >/dev/null <<EOF
[Unit]
Description=Family Menu (Docker Compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${ROOT}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/docker compose --env-file ${ENV_FILE} -f compose.yaml -f compose.vps.yaml up -d --remove-orphans
ExecStop=/usr/bin/docker compose --env-file ${ENV_FILE} -f compose.yaml -f compose.vps.yaml stop
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable family-menu.service
  echo "已启用开机自启: family-menu.service"
}

install_docker
write_env_file

# 加载 .env.vps 中的覆盖项（若有）
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://${PUBLIC_HOST}:${PUBLIC_PORT}}"
export PUBLIC_BASE_URL

compose up -d --build --remove-orphans
wait_health
install_systemd_unit

echo ""
echo "=========================================="
echo "长期访问地址: $PUBLIC_BASE_URL"
echo "健康检查:     $PUBLIC_BASE_URL/api/health"
echo "环境文件:     $ENV_FILE"
echo "数据卷:       docker volume (postgres_data / minio_data)"
echo "=========================================="
echo "常用命令:"
echo "  docker compose --env-file $ENV_FILE -f compose.yaml -f compose.vps.yaml ps"
echo "  docker compose --env-file $ENV_FILE -f compose.yaml -f compose.vps.yaml logs -f"
echo "  sudo systemctl status family-menu"
