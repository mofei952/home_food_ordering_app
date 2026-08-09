# 云主机长期部署

把家庭点菜长期跑在自有云服务器上（替代 Cloudflare 临时隧道）。

## 目标环境

| 项 | 默认值 |
| --- | --- |
| 公网 IP | `139.196.83.119` |
| 访问端口 | `18080`（避开常见占用，如 New API `:3000`） |
| 访问地址 | `http://139.196.83.119:18080` |
| 代码目录 | `/opt/family-menu` |
| 进程管理 | `systemd` 单元 `family-menu.service`（开机自启） |

数据落在 Docker 卷 `postgres_data` / `minio_data`，重启与发版不会清空。

## 前置条件

1. 云安全组 / 防火墙放行：**TCP 18080**（以及你 SSH 用的 22）
2. 服务器可执行 `docker compose`
3. 本机或服务器具备仓库代码
4. 若由 Cursor Cloud Agent 代部署：把 Agent 公钥写入服务器 `authorized_keys`（用户名按你机器调整）：

```bash
# 在云服务器上执行
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAcsSVSY8GNk+O2Aae76KKFFXsx+Lx4qrzmH8d/lGz84 cursor-agent-family-menu-deploy' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

> 当前探测：该 IP 上 `:3000` 已有 New API；`:80/:8080` 等端口不可用。因此默认挂在 **18080**。

## 方式 A：登录服务器一键部署

```bash
# 上传或 git clone 仓库到 /opt/family-menu 后：
cd /opt/family-menu
PUBLIC_HOST=139.196.83.119 PUBLIC_PORT=18080 ./scripts/deploy-vps.sh
```

脚本会：

1. 安装 Docker（若缺失）
2. 写入 `.env.vps`
3. `docker compose -f compose.yaml -f compose.vps.yaml up -d --build`
4. 等待 `/api/health`
5. 安装并 enable `family-menu.service`

## 方式 B：本机 SSH 远程部署

先确保能免密登录（或指定密钥）：

```bash
ssh root@139.196.83.119
# 或
ssh -i ~/.ssh/your_key ubuntu@139.196.83.119
```

然后在仓库根目录：

```bash
SSH_USER=root \
SSH_IDENTITY=~/.ssh/your_key \
PUBLIC_HOST=139.196.83.119 \
PUBLIC_PORT=18080 \
./scripts/remote-deploy-vps.sh
```

## 验证

```bash
curl -fsS http://139.196.83.119:18080/api/health
# 浏览器打开
# http://139.196.83.119:18080
```

## 常用运维

```bash
cd /opt/family-menu
docker compose --env-file .env.vps -f compose.yaml -f compose.vps.yaml ps
docker compose --env-file .env.vps -f compose.yaml -f compose.vps.yaml logs -f
sudo systemctl status family-menu
sudo systemctl restart family-menu
```

备份：

```bash
docker compose --env-file .env.vps -f compose.yaml -f compose.vps.yaml \
  exec db pg_dump -U family_menu family_menu > backup-$(date +%F).sql
```

## HTTPS / 域名（可选）

当前默认是 **HTTP + IP:端口**（`SECURE_COOKIES=false`），方便先上线。

若已有域名并做 HTTPS 反代：

1. 将反代指到 `127.0.0.1:18080`（或把 Caddy 改挂 443）
2. 在 `.env.vps` 设 `PUBLIC_BASE_URL=https://your.domain`
3. 在 `compose.vps.yaml` / 环境中把 `SECURE_COOKIES` 改为 `true`
4. `./scripts/deploy-vps.sh` 再发一版

## 安全提示

- 不要把 Docker API（2375）暴露到公网
- 生产环境请修改 Postgres / MinIO 默认口令（见 `.env.example` 与 `compose.yaml`）
- 安全组仅放行必要端口
