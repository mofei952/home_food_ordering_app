# 家庭点菜

家庭点菜 PWA 的前后端应用骨架。后端使用 FastAPI 和 PostgreSQL，前端使用
React、TypeScript 和 Vite。

## 本地运行

需要 Python 3.12+、uv、Node.js 22+、npm 和 Docker。

```bash
cp .env.example .env
docker compose up -d db

cd backend
uv sync
uv run uvicorn app.main:app --reload
```

另开终端启动前端；开发服务器会将 `/api` 代理到
`http://localhost:8000`。

```bash
cd frontend
npm ci
npm run dev
```

访问 `http://localhost:5173`。后端健康检查为
`http://localhost:8000/api/health`。

## 测试与质量检查

```bash
cd backend
uv run ruff check .
uv run mypy app
uv run pytest -v

cd ../frontend
npm test -- --run
npm run build
```

## 更新 OpenAPI 类型

```bash
cd backend
uv run python -m scripts.export_openapi
cd ../frontend
npm run api:generate
```
