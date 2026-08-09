#!/usr/bin/env bash
# 从本机通过 SSH 把当前仓库同步到云主机并执行长期部署。
# 依赖：SSH 公钥已加入目标机（或可用 ssh-agent / 指定 IdentityFile）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PUBLIC_HOST="${PUBLIC_HOST:-139.196.83.119}"
PUBLIC_PORT="${PUBLIC_PORT:-18080}"
SSH_USER="${SSH_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/family-menu}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://${PUBLIC_HOST}:${PUBLIC_PORT}}"

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

请任选其一后重试：
1) 把本机公钥写入服务器 ~/.ssh/authorized_keys
2) 设置环境变量后重跑：
   SSH_USER=xxx SSH_IDENTITY=/path/to/key PUBLIC_HOST=${PUBLIC_HOST} ./scripts/remote-deploy-vps.sh
3) 登录服务器后手动执行：
   cd ${REMOTE_DIR:-/opt/family-menu} && PUBLIC_HOST=${PUBLIC_HOST} PUBLIC_PORT=${PUBLIC_PORT} ./scripts/deploy-vps.sh
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
