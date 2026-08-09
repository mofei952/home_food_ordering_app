#!/usr/bin/env bash
# 从本机通过 SSH 把当前仓库同步到云主机并执行长期部署。
#
# 认证优先级：
# 1) SSH_IDENTITY（显式私钥路径）
# 2) VPS_SSH_PRIVATE_KEY（Cursor / CI 环境密钥，推荐持久化）
# 3) ssh-agent / 默认 ~/.ssh/id_*
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PUBLIC_HOST="${PUBLIC_HOST:-139.196.83.119}"
PUBLIC_PORT="${PUBLIC_PORT:-18080}"
SSH_USER="${SSH_USER:-${VPS_SSH_USER:-root}}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/family-menu}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://${PUBLIC_HOST}:${PUBLIC_PORT}}"

TMP_KEY=""
cleanup() {
  if [[ -n "$TMP_KEY" && -f "$TMP_KEY" ]]; then
    rm -f "$TMP_KEY"
  fi
}
trap cleanup EXIT

if [[ -z "$SSH_IDENTITY" && -n "${VPS_SSH_PRIVATE_KEY:-}" ]]; then
  TMP_KEY="$(mktemp)"
  # 兼容密钥里用字面量 \n 保存的情况
  if [[ "$VPS_SSH_PRIVATE_KEY" == *'\\n'* ]]; then
    printf '%b' "$VPS_SSH_PRIVATE_KEY" >"$TMP_KEY"
  else
    printf '%s\n' "$VPS_SSH_PRIVATE_KEY" >"$TMP_KEY"
  fi
  chmod 600 "$TMP_KEY"
  SSH_IDENTITY="$TMP_KEY"
fi

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -p "$SSH_PORT")
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "$SSH_IDENTITY")
fi

REMOTE="${SSH_USER}@${PUBLIC_HOST}"

echo "目标: $REMOTE:$REMOTE_DIR"
echo "访问: $PUBLIC_BASE_URL"

if ! ssh "${SSH_OPTS[@]}" "$REMOTE" 'echo ok' >/dev/null; then
  cat >&2 <<EOF
无法 SSH 登录 ${REMOTE}。

推荐一次配置（之后无需再加公钥）：
1) 在 Cursor 环境密钥中配置 VPS_SSH_PRIVATE_KEY（固定部署私钥）
2) 把对应公钥写入服务器 ~/.ssh/authorized_keys（只做一次）
3) 可选：设置 VPS_SSH_USER（默认 root）

临时排查：
- SSH_USER=xxx SSH_IDENTITY=/path/to/key ./scripts/remote-deploy-vps.sh
- 或登录服务器后执行：
  cd ${REMOTE_DIR} && PUBLIC_HOST=${PUBLIC_HOST} PUBLIC_PORT=${PUBLIC_PORT} ./scripts/deploy-vps.sh
EOF
  exit 1
fi

ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo mkdir -p '$REMOTE_DIR' && sudo chown -R \$(id -u):\$(id -g) '$REMOTE_DIR'"

# 优先 rsync；否则 tar over ssh
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'frontend/dist' \
    --exclude 'backend/.venv' \
    --exclude '.env' \
    --exclude '.env.vps' \
    -e "ssh ${SSH_OPTS[*]}" \
    "$ROOT/" "$REMOTE:$REMOTE_DIR/"
else
  tar czf - \
    --exclude .git \
    --exclude node_modules \
    --exclude frontend/dist \
    --exclude backend/.venv \
    --exclude .env \
    --exclude .env.vps \
    -C "$ROOT" . \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p '$REMOTE_DIR' && tar xzf - -C '$REMOTE_DIR'"
fi

ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "cd '$REMOTE_DIR' && chmod +x scripts/deploy-vps.sh && \
   PUBLIC_HOST='$PUBLIC_HOST' PUBLIC_PORT='$PUBLIC_PORT' PUBLIC_BASE_URL='$PUBLIC_BASE_URL' \
   ./scripts/deploy-vps.sh"

echo ""
echo "部署完成: $PUBLIC_BASE_URL"
echo "健康检查: $PUBLIC_BASE_URL/api/health"
