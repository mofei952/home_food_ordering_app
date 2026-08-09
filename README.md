# 家庭点菜

家庭点菜是一个可安装的移动优先 PWA：两位（及以上）家庭成员在同一家庭内点菜、确认菜单，并可用食材/随机推荐辅助决策。

后端：FastAPI + PostgreSQL（本地验收也可 SQLite）  
前端：React + TypeScript + Vite + Playwright

## 先决条件

- Python 3.12+ 与 [uv](https://github.com/astral-sh/uv)
- Node.js >= 22.13.0 与 npm
- （推荐）Docker / Docker Compose：用于 PostgreSQL、MinIO、同源反向代理的生产式本地栈
- 本仓库在无 Docker 的环境也可开发与跑通 Playwright（SQLite + 内存图片存储）

## 环境变量

复制示例文件：

```bash
cp .env.example .env
```

常用变量：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 异步 SQLAlchemy URL。Compose/Postgres 示例见 `.env.example`；本地 e2e 可用 `sqlite+aiosqlite:////tmp/family-menu-e2e.db` |
| `ENVIRONMENT` | `development` 时 Cookie 默认不要求 Secure；生产用 `production` |
| `SECURE_COOKIES` | 显式覆盖 Cookie Secure。本地 Compose 走 HTTP `:8080` 时设为 `false`（见 `compose.yaml`） |
| `TRUSTED_PROXY_HEADERS` | `true` 时加入限流信任代理头：优先 `X-Real-IP`，否则取 `X-Forwarded-For` **最右**一跳（Compose 在 Caddy 后设为 true） |
| `IMAGE_STORAGE` | `s3`（默认）或 `memory`（本地/测试） |
| `S3_ENDPOINT_URL` | SDK 访问对象存储的内部地址（Compose 内为 `http://minio:9000`） |
| `S3_PUBLIC_ENDPOINT_URL` | 浏览器可访问的签名 URL 主机（Compose：`http://127.0.0.1:9000`；未设则同 `S3_ENDPOINT_URL`） |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` / `S3_REGION` | 对象存储凭证与桶（Compose 内为 MinIO） |

## 数据库迁移

```bash
cd backend
uv sync
uv run alembic upgrade head
```

空库执行 `upgrade head` 即可建立 households / dishes / meals / metrics 全部表。  
SQLite 本地 e2e 也可使用：

```bash
DATABASE_URL=sqlite+aiosqlite:////tmp/family-menu-e2e.db \
  uv run python scripts/reset_sqlite_schema.py
```

## 本地启动（开发）

### 仅依赖容器（有 Docker 时）

```bash
docker compose up -d db minio minio-init
```

### API

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

无 MinIO 时显式使用内存图片存储：

```bash
IMAGE_STORAGE=memory ENVIRONMENT=development \
  uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 前端

开发服务器将 `/api` 代理到 `http://127.0.0.1:8000`（同源相对路径，避免跨站 Cookie）：

```bash
cd frontend
npm ci
npm run dev
```

访问 `http://127.0.0.1:5173`。健康检查：`http://127.0.0.1:8000/api/health`。

## 生产式 Compose（同源反向代理）

`compose.yaml` 提供 `db`、`minio`、`backend`、`frontend`、`caddy`：

```bash
docker compose up -d --build
# Caddy 监听宿主机 8080，/api → backend，其余 → frontend
curl -fsS http://127.0.0.1:8080/api/health
```

Backend 容器入口脚本会在启动 uvicorn 前执行 `alembic upgrade head`，无需手动迁移。

本地 HTTP 试跑要点：

- `SECURE_COOKIES=false`：避免在明文 HTTP 下签发 Secure Cookie（移动浏览器会丢弃）
- `TRUSTED_PROXY_HEADERS=true`：加入限流按真实客户端 IP 分桶（`X-Real-IP` 或 XFF 最右一跳）
- MinIO：`S3_ENDPOINT_URL=http://minio:9000`（容器内），`S3_PUBLIC_ENDPOINT_URL=http://127.0.0.1:9000`（浏览器签名 URL）
- 端口：Caddy `8080`，Postgres `5432`，MinIO API `9000` / Console `9001`

`deploy/Caddyfile` 保证浏览器只与同一来源通信，Session Cookie 不会变成跨站请求。`/family-menu/*` 经 Caddy 反代 MinIO，供公网 HTTPS 下的图片签名 URL 使用。

## 公网临时演示（Cloud Agent / 无入站端口）

云端 VM 通常无法从互联网直接访问 `:8080`。可用宿主机栈 + Cloudflare 临时隧道：

```bash
./scripts/deploy-public-native.sh
```

脚本会构建前端、启动 MinIO + API + Caddy（`:8080`），并输出 `https://*.trycloudflare.com` 公网地址。数据在 `/tmp/family-menu-data`（SQLite + MinIO 本地目录）。

注意：隧道域名在 `cloudflared` 重启后会变；Agent 关机后服务停止。长期生产请用自有域名、固定隧道或云主机部署（见下方与 `docs/deploy-vps.md`）。

## 云主机长期部署（推荐）

默认目标：`http://139.196.83.119:18080`（端口可改，避开已占用的 `:3000` 等服务）。

服务器上：

```bash
cd /opt/family-menu
PUBLIC_HOST=139.196.83.119 PUBLIC_PORT=18080 ./scripts/deploy-vps.sh
```

本机已配置 SSH 时：

```bash
SSH_USER=root SSH_IDENTITY=~/.ssh/your_key ./scripts/remote-deploy-vps.sh
```

说明与运维命令见 [`docs/deploy-vps.md`](docs/deploy-vps.md)。临时隧道方案见 `scripts/deploy-public.sh` / `scripts/deploy-public-native.sh`。

## 测试与统一验收

```bash
# 后端
uv run --directory backend ruff check .
uv run --directory backend mypy app
uv run --directory backend pytest tests -v

# 前端
npm --prefix frontend test -- --run
npm --prefix frontend run build
```

端到端（首次需安装浏览器）：

```bash
cd frontend
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

一键验收（含 e2e）：

```bash
./scripts/verify.sh
```

`scripts/verify.sh` 行为：

1. ruff / mypy / pytest / 前端单测 / 生产构建  
2. e2e：**默认**本地 SQLite + Vite（已验证路径）；`E2E_USE_COMPOSE=1` 时才对 Compose/Caddy 跑 Playwright  
3. 可选 `COMPOSE_SMOKE=1`：拉起 Compose 并检查 `/api/health`（依赖 entrypoint 迁移）  
4. `E2E_RANDOM_SEED` / `VITE_E2E_RANDOM_SEED` 可注入前端随机推荐（测试用）

## 备份与恢复

Postgres（Compose 卷 `postgres_data`）：

```bash
docker compose exec db pg_dump -U family_menu family_menu > backup-$(date +%F).sql
docker compose exec -T db psql -U family_menu family_menu < backup-YYYY-MM-DD.sql
```

MinIO / S3 图片桶 `family-menu` 请同步备份对象（`mc mirror` 或云厂商快照）。  
恢复后执行 `alembic upgrade head` 确认 schema 最新。

## 邀请码找回

邀请码仅在创建家庭或「刷新邀请码」时明文展示一次（库内只存哈希）。  
若成员尚未加入且创建者丢失邀请码：由创建者登录后在「家庭」页点击「刷新邀请码」，把新码发给成员。  
旧码立即失效。

## 两周验证流程

1. 家庭至少录入日常菜品（建议 15+），两位成员安装 PWA（移动 Chrome / Safari）。  
2. 连续约 14 天在「今天」完成点菜与「确认菜单」；可用「帮我选」辅助。  
3. 在「家庭 → 历史菜单」核对快照菜名（菜品改名后历史仍显示确认时的名字）。  
4. 打开验证摘要：确认已统计餐次比例与确认耗时中位数；目标参考为约 70% 餐次有确认记录、中位确认时长约 150 秒（以摘要展示为准）。  
5. 跑 `./scripts/verify.sh` 与跨家庭隔离集成测试，确认无越权读写。

## 更新 OpenAPI 类型

```bash
cd backend
uv run python -m scripts.export_openapi
cd ../frontend
npm run api:generate
```
