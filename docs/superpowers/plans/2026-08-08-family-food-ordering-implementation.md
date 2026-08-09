# 家庭点菜 PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可供单个家庭连续验证两周的移动优先 PWA，支持家庭菜品库、按餐次点菜、人工确认、随机推荐、食材匹配、历史记录和验证指标。

**Architecture:** 使用 React、TypeScript 和 Vite 构建前端 PWA，使用 FastAPI、SQLAlchemy 和 PostgreSQL 构建单体 REST API。生产环境通过同一站点的 `/api` 路径代理后端，前后端以 OpenAPI 为契约；图片保存在兼容 S3 的私有对象存储中。

**Tech Stack:** React、TypeScript、Vite、TanStack Query、React Router、Vitest、Testing Library、Playwright、FastAPI、Pydantic、SQLAlchemy 2、Alembic、PostgreSQL、pytest、Ruff、mypy、Argon2、S3 API、Docker Compose

## Global Constraints

- Python 使用 3.12 或更高版本，Node.js 使用 22 LTS 或更高版本。
- 实施时通过包管理器安装各依赖的最新稳定版本，并提交 `uv.lock` 和 `package-lock.json`。
- 目标浏览器为最新两个主版本的移动 Chrome 和 Safari。
- 核心业务时间统一以 UTC 存储，以家庭时区转换日期；首版家庭时区在创建后不可修改。
- PIN 为 4–6 位数字；邀请码为排除 `0/O/1/I` 的 8 位大写字符。
- 每个数据库查询和写入都必须校验当前会话所属家庭。
- 首版不加入 AI、周菜单、采购清单、长期库存、推送、WebSocket 或完整离线写入。
- 随机算法必须支持注入固定种子，自动化测试不得依赖非确定随机结果。
- 所有用户可见文案使用简体中文。

## File Structure

```text
.
├── compose.yaml                         # 本地 PostgreSQL 与对象存储
├── .env.example                         # 根目录环境变量示例
├── backend/
│   ├── pyproject.toml                   # Python 依赖与质量工具
│   ├── scripts/export_openapi.py        # 导出稳定 OpenAPI 文件
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/                    # 按任务增加数据库迁移
│   ├── app/
│   │   ├── main.py                      # FastAPI 组装与路由注册
│   │   ├── config.py                    # 环境配置
│   │   ├── db.py                        # SQLAlchemy 引擎与会话
│   │   ├── errors.py                    # 统一领域错误映射
│   │   ├── security.py                  # PIN、邀请码、会话令牌
│   │   ├── common/models.py             # UUID 与时间戳基类
│   │   ├── households/                  # 家庭、成员、会话
│   │   ├── dishes/                      # 菜品、制作者、食材
│   │   ├── meals/                       # 餐次、点菜和最终菜单
│   │   ├── recommendations/             # 纯随机与食材匹配规则
│   │   ├── metrics/                     # 历史和验证事件
│   │   └── images/                      # 图片校验与对象存储适配
│   └── tests/
│       ├── conftest.py                  # PostgreSQL 测试事务与客户端
│       └── feature test modules         # 与 app 模块对应的测试
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── playwright.config.ts
│   ├── openapi.json                     # 后端导出的接口契约
│   ├── public/                          # manifest 与生成后的图标
│   ├── scripts/generate-icons.mjs
│   ├── src/
│   │   ├── app/                         # 路由、Provider、底部导航
│   │   ├── api/                         # 生成的 OpenAPI 类型与 fetch 封装
│   │   ├── features/households/
│   │   ├── features/dishes/
│   │   ├── features/meals/
│   │   ├── features/recommendations/
│   │   ├── features/history/
│   │   ├── features/images/
│   │   └── test/
│   └── e2e/                             # 手机视口端到端测试
└── README.md                            # 本地运行、测试和部署说明
```

---

### Task 1: 建立可运行、可测试的前后端骨架

**Files:**
- Create: `.gitignore`
- Create: `compose.yaml`
- Create: `.env.example`
- Create: `backend/pyproject.toml`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/main.py`
- Create: `backend/scripts/export_openapi.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/api/generated.ts`
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/App.test.tsx`
- Create: `frontend/src/test/setup.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: `GET /api/health -> {"status":"ok"}`。
- Produces: `app.config.Settings`、`app.db.get_session()` 和 `app.main.create_app()`。
- Produces: 前端测试、构建和开发代理的稳定命令。

- [ ] **Step 1: 写出前后端骨架的失败测试**

```python
# backend/tests/test_health.py
from fastapi.testclient import TestClient
from app.main import create_app


def test_health_returns_ok() -> None:
    response = TestClient(create_app()).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

```tsx
// frontend/src/app/App.test.tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the product name", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "家庭点菜" })).toBeVisible();
});
```

- [ ] **Step 2: 运行测试并确认因入口尚不存在而失败**

Run:

```bash
cd backend && uv run pytest tests/test_health.py -v
cd ../frontend && npm test -- --run src/app/App.test.tsx
```

Expected: 后端报 `ModuleNotFoundError: app`，前端报找不到 `App` 或测试脚本。

- [ ] **Step 3: 初始化依赖、数据库服务和最小应用**

Run:

```bash
cd backend
uv init --bare
uv add fastapi "uvicorn[standard]" pydantic-settings sqlalchemy asyncpg alembic
uv add --dev pytest httpx ruff mypy
cd ../frontend
npm init -y
npm install react react-dom @tanstack/react-query react-router-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/jest-dom openapi-typescript
npm pkg set scripts.dev="vite" scripts.build="tsc -b && vite build" scripts.test="vitest" scripts.api:generate="openapi-typescript openapi.json -o src/api/generated.ts"
```

Create `.gitignore` with `.superpowers/`, `.env`, Python caches、`backend/.venv/`、`frontend/node_modules/`、`frontend/dist/` and Playwright output directories.

Use this backend entry point:

```python
# backend/app/main.py
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="家庭点菜 API")

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

Use this local database definition:

```yaml
# compose.yaml
services:
  db:
    image: postgres:18
    environment:
      POSTGRES_DB: family_menu
      POSTGRES_USER: family_menu
      POSTGRES_PASSWORD: family_menu
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U family_menu"]
      interval: 2s
      timeout: 2s
      retries: 20
    volumes: [postgres_data:/var/lib/postgresql]
volumes:
  postgres_data:
```

Use this OpenAPI exporter:

```python
# backend/scripts/export_openapi.py
import json
from pathlib import Path
from app.main import create_app

target = Path(__file__).parents[2] / "frontend" / "openapi.json"
target.write_text(json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n")
```

Set `"api:generate": "openapi-typescript openapi.json -o src/api/generated.ts"` in `frontend/package.json`. `vite.config.ts` proxies `/api` to `http://localhost:8000`.

Use this frontend root:

```tsx
// frontend/src/app/App.tsx
export function App() {
  return (
    <main>
      <h1>家庭点菜</h1>
      <p>让今天吃什么更快有答案。</p>
    </main>
  );
}
```

- [ ] **Step 4: 运行质量检查和测试**

Run:

```bash
cd backend
uv run ruff check .
uv run mypy app
uv run pytest -v
cd ../frontend
npm run api:generate
npm test -- --run
npm run build
```

Expected: 所有命令退出码为 0，后端 1 个测试和前端 1 个测试通过。

- [ ] **Step 5: 提交骨架**

```bash
git add compose.yaml .env.example backend frontend README.md
git commit -m "chore: scaffold family menu application"
```

---

### Task 2: 实现家庭、成员和安全会话

**Files:**
- Create: `backend/app/common/models.py`
- Create: `backend/app/errors.py`
- Create: `backend/app/security.py`
- Create: `backend/app/households/models.py`
- Create: `backend/app/households/schemas.py`
- Create: `backend/app/households/service.py`
- Create: `backend/app/households/router.py`
- Create: `backend/alembic/versions/0001_households.py`
- Create: `backend/tests/households/test_api.py`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/features/households/api.ts`
- Create: `frontend/src/features/households/OnboardingPage.tsx`
- Create: `frontend/src/features/households/OnboardingPage.test.tsx`
- Create: `frontend/src/features/households/FamilyPage.tsx`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Modify: `frontend/openapi.json`
- Modify: `frontend/src/api/generated.ts`
- Modify: `frontend/src/app/App.tsx`

**Interfaces:**
- Produces: `POST /api/households`、`POST /api/households/join`、`GET /api/session`、`DELETE /api/session`。
- Produces: `POST /api/households/invite/rotate` 和成员停用、PIN 重置端点，仅家庭创建者可调用。
- Produces: HttpOnly `family_session` Cookie 和 `require_member()` 依赖。
- Produces: `apiFetch<T>(path, init)`，后续全部前端 API 调用复用。

- [ ] **Step 1: 写家庭创建、加入、隔离和权限测试**

```python
# backend/tests/households/test_api.py
def test_create_and_join_household(client):
    created = client.post(
        "/api/households",
        json={"household_name": "我家", "owner_name": "小林", "pin": "1234", "timezone": "Asia/Shanghai"},
    )
    assert created.status_code == 201
    invite_code = created.json()["invite_code"]
    assert len(invite_code) == 8

    joined = client.post(
        "/api/households/join",
        json={"invite_code": invite_code, "nickname": "小周", "pin": "5678"},
    )
    assert joined.status_code == 201
    assert joined.json()["member"]["nickname"] == "小周"


def test_non_owner_cannot_rotate_invite(joined_client):
    response = joined_client.post("/api/households/invite/rotate")
    assert response.status_code == 403


@pytest.mark.parametrize("pin", ["123", "1234567", "12ab"])
def test_rejects_invalid_pin(client, pin):
    response = client.post(
        "/api/households",
        json={"household_name": "我家", "owner_name": "小林", "pin": pin, "timezone": "Asia/Shanghai"},
    )
    assert response.status_code == 422


def test_existing_nickname_with_correct_pin_signs_in(client, household):
    response = client.post(
        "/api/households/join",
        json={"invite_code": household.invite_code, "nickname": "小林", "pin": "1234"},
    )
    assert response.status_code == 200
    assert response.json()["member"]["id"] == str(household.owner_id)
```

Create separate tests named `test_wrong_pin_returns_401`、`test_expired_session_returns_401`、`test_disabled_member_returns_403` and `test_cross_household_member_returns_404`; each prepares the named state, calls `GET /api/session` or the member endpoint, and asserts the exact status in its name.

- [ ] **Step 2: 运行家庭 API 测试并确认失败**

Run: `cd backend && uv run pytest tests/households/test_api.py -v`

Expected: FAIL because household routes and tables do not exist.

- [ ] **Step 3: 实现领域模型、安全函数和迁移**

Run: `cd backend && uv add argon2-cffi`

Use these exact security signatures:

```python
# backend/app/security.py
import hashlib
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
PIN_PATTERN = re.compile(r"^\d{4,6}$")
password_hasher = PasswordHasher()

def hash_pin(pin: str) -> str:
    if PIN_PATTERN.fullmatch(pin) is None:
        raise ValueError("PIN must contain 4 to 6 digits")
    return password_hasher.hash(pin)


def verify_pin(pin: str, encoded: str) -> bool:
    try:
        return password_hasher.verify(encoded, pin)
    except VerifyMismatchError:
        return False


def generate_invite_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_session_token() -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(32)
    return raw_token, hash_secret(raw_token)
```

`new_session_token()` returns `(raw_token, sha256_hash)`, and only the hash is stored. Models must include:

```python
class Household:
    id: UUID
    name: str
    timezone: str
    invite_code_hash: str
    created_at: datetime

class Member:
    id: UUID
    household_id: UUID
    nickname: str
    pin_hash: str
    role: Literal["owner", "member"]
    status: Literal["active", "disabled"]

class Session:
    id: UUID
    member_id: UUID
    token_hash: str
    expires_at: datetime
```

Create a unique PostgreSQL index on `(household_id, lower(nickname))`. Session cookies must be HttpOnly, SameSite Lax, Secure outside development, and expire after 30 days.

Add `test_pin_rate_limit_returns_429_after_five_failures` and `test_join_rate_limit_returns_429_after_ten_failures`. Implement a 15-minute in-process sliding window keyed by member ID for PIN verification and normalized client IP for invite joining; inject a monotonic clock so tests advance the window without sleeping. This is sufficient for the single API process used by the first validation deployment.

- [ ] **Step 4: 实现前端引导和家庭管理页**

```ts
// frontend/src/api/client.ts
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const body = await response.json().catch(() => ({}));
    return new ApiError(body.detail ?? "请求失败", response.status, body.code ?? "http_error");
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw await ApiError.fromResponse(response);
  return response.json() as Promise<T>;
}
```

引导页提供“创建家庭”和“加入家庭”两个表单；家庭页显示成员、当前角色、当前邀请码和邀请码刷新按钮。邀请码明文保存并随会话返回，登录后可在家庭页随时查看；创建者仍可刷新作废旧码。

- [ ] **Step 5: 运行后端、前端和迁移测试**

Run:

```bash
docker compose up -d db
cd backend
uv run alembic upgrade head
uv run python scripts/export_openapi.py
uv run pytest tests/households -v
cd ../frontend
npm run api:generate
npm test -- --run src/features/households
```

Expected: 所有家庭测试通过；创建者和普通成员权限测试均通过。

- [ ] **Step 6: 提交家庭身份模块**

```bash
git add backend frontend
git commit -m "feat: add household membership and sessions"
```

---

### Task 3: 实现家庭菜品库

**Files:**
- Create: `backend/app/dishes/models.py`
- Create: `backend/app/dishes/schemas.py`
- Create: `backend/app/dishes/service.py`
- Create: `backend/app/dishes/router.py`
- Create: `backend/alembic/versions/0002_dishes.py`
- Create: `backend/tests/dishes/test_api.py`
- Create: `frontend/src/features/dishes/api.ts`
- Create: `frontend/src/features/dishes/DishListPage.tsx`
- Create: `frontend/src/features/dishes/DishForm.tsx`
- Create: `frontend/src/features/dishes/DishListPage.test.tsx`
- Modify: `backend/app/main.py`
- Modify: `frontend/openapi.json`
- Modify: `frontend/src/api/generated.ts`
- Modify: `frontend/src/app/App.tsx`

**Interfaces:**
- Produces: `GET/POST /api/dishes`、`GET/PATCH/DELETE /api/dishes/{dish_id}`。
- Produces: `GET /api/ingredients?query=` 和 `POST /api/ingredients`。
- Produces: `DishRead {id,name,category,cooks,ingredients,image_url,archived_at,updated_by,updated_at}`。

- [ ] **Step 1: 写菜品 CRUD、同义词和家庭隔离测试**

```python
def test_create_dish_with_multiple_cooks_and_ingredients(client, members):
    response = client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [str(members.owner.id), str(members.other.id)],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    assert response.status_code == 201
    assert {item["name"] for item in response.json()["ingredients"]} == {"番茄", "鸡蛋"}


def test_alias_matches_canonical_ingredient(client):
    tomato = client.post("/api/ingredients", json={"name": "番茄", "aliases": ["西红柿"]}).json()
    results = client.get("/api/ingredients?query=西红柿").json()
    assert results[0]["id"] == tomato["id"]


def test_dish_requires_an_ingredient(client, members):
    response = client.post(
        "/api/dishes",
        json={"name": "白饭", "category": "主食", "cook_ids": [str(members.owner.id)], "ingredients": []},
    )
    assert response.status_code == 422


def test_cannot_assign_cook_from_another_household(client, foreign_member):
    response = client.post(
        "/api/dishes",
        json={"name": "炒饭", "category": "主食", "cook_ids": [str(foreign_member.id)], "ingredients": ["米饭"]},
    )
    assert response.status_code == 404
```

Create `test_duplicate_names_with_different_cooks_are_allowed` and assert two distinct IDs; create `test_delete_archives_dish` and assert `archived_at` is non-null; create `test_default_list_excludes_archived_dishes` and assert the archived ID is absent.

- [ ] **Step 2: 运行菜品测试并确认失败**

Run: `cd backend && uv run pytest tests/dishes/test_api.py -v`

Expected: FAIL because `/api/dishes` does not exist.

- [ ] **Step 3: 实现菜品、制作者和规范食材**

Create these relationships:

```text
dishes 1─* dish_cooks *─1 members
dishes 1─* dish_ingredients *─1 ingredients
ingredients 1─* ingredient_aliases
```

Every ingredient and alias belongs to one household. Add unique constraints on `(household_id, normalized_name)`. Normalize lookup with `unicodedata.normalize("NFKC", value).strip().casefold()`. Every mutation sets `created_by_id` or `updated_by_id`; DELETE sets `archived_at` and never removes rows.

- [ ] **Step 4: 实现移动端菜品列表和表单**

`DishForm` must submit this stable shape:

```ts
export type DishInput = {
  name: string;
  category: "荤菜" | "素菜" | "主食" | "汤" | "其他";
  cookIds: string[];
  ingredients: string[];
  imageKey: string | null;
};
```

List cards show dish name, category, cooks and main ingredients. Filters support cook and category. Archive requires a confirmation dialog.

- [ ] **Step 5: 验证菜品模块**

Run:

```bash
cd backend
uv run alembic upgrade head
uv run python scripts/export_openapi.py
uv run pytest tests/dishes -v
cd ../frontend
npm run api:generate
npm test -- --run src/features/dishes
```

Expected: 菜品 API 和页面测试全部通过。

- [ ] **Step 6: 提交菜品模块**

```bash
git add backend frontend
git commit -m "feat: add household dish catalog"
```

---

### Task 4: 实现按日期和餐次协作点菜

**Files:**
- Create: `backend/app/meals/models.py`
- Create: `backend/app/meals/schemas.py`
- Create: `backend/app/meals/service.py`
- Create: `backend/app/meals/router.py`
- Create: `backend/alembic/versions/0003_meals.py`
- Create: `backend/tests/meals/test_api.py`
- Create: `backend/tests/meals/test_concurrency.py`
- Create: `frontend/src/features/meals/api.ts`
- Create: `frontend/src/features/meals/TodayPage.tsx`
- Create: `frontend/src/features/meals/MealRequests.tsx`
- Create: `frontend/src/features/meals/MenuEditor.tsx`
- Create: `frontend/src/features/meals/TodayPage.test.tsx`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/openapi.json`
- Modify: `frontend/src/api/generated.ts`

**Interfaces:**
- Produces: `GET /api/meal-slots/{date}/{meal_type}`。
- Produces: `PUT/DELETE /api/meal-slots/{slot_id}/requests/{dish_id}`。
- Produces: `PUT /api/meal-slots/{slot_id}/menu` with `{dish_ids, expected_version}`。
- Produces: `MealSlotRead` with `status`、merged requests、menu、`version`、last modifier。

- [ ] **Step 1: 写餐次状态、请求合并和确认测试**

```python
def test_same_dish_requests_are_merged(client, other_client, dish):
    slot = client.get("/api/meal-slots/2026-08-10/dinner").json()
    client.put(f"/api/meal-slots/{slot['id']}/requests/{dish.id}")
    other_client.put(f"/api/meal-slots/{slot['id']}/requests/{dish.id}")

    result = client.get("/api/meal-slots/2026-08-10/dinner").json()
    request = result["requests"][0]
    assert request["dish_id"] == str(dish.id)
    assert len(request["requested_by"]) == 2
    assert result["status"] == "pending"


def test_any_member_can_confirm_menu(other_client, slot, dish):
    response = other_client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [str(dish.id)], "expected_version": 0},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


def test_member_can_only_withdraw_own_request(client, other_client, slot, dish):
    other_client.put(f"/api/meal-slots/{slot.id}/requests/{dish.id}")
    response = client.delete(f"/api/meal-slots/{slot.id}/requests/{dish.id}")
    assert response.status_code == 204
    result = other_client.get(f"/api/meal-slots/{slot.local_date}/{slot.meal_type}").json()
    assert result["requests"][0]["requested_by"] != []


def test_stale_menu_version_returns_conflict(client, slot, dish):
    client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [str(dish.id)], "expected_version": 0},
    )
    response = client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [], "expected_version": 0},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "version_conflict"
```

Create `test_accepts_more_than_ten_requests`、`test_menu_accepts_unrequested_active_dish`、`test_menu_rejects_archived_dish`、`test_duplicate_request_is_idempotent` and `test_meal_date_uses_household_timezone`; assert respectively 11 stored requests, HTTP 200, HTTP 422, one request row, and the expected local date around a UTC-day boundary.

- [ ] **Step 2: 运行餐次测试并确认失败**

Run: `cd backend && uv run pytest tests/meals/test_api.py -v`

Expected: FAIL because meal models and routes do not exist.

- [ ] **Step 3: 实现餐次模型和幂等写入**

Use these constraints:

```text
UNIQUE meal_slots(household_id, local_date, meal_type)
UNIQUE meal_requests(meal_slot_id, member_id, dish_id)
UNIQUE menu_items(meal_slot_id, dish_id)
```

`menu_items` stores `dish_name_snapshot` and `image_key_snapshot`. `PUT menu` compares `expected_version`; stale writes return HTTP 409 with `{"code":"version_conflict","current_version":N}`. A successful write increments the slot version and records modifier and time.

- [ ] **Step 4: 实现“今天”页面**

页面包含：

1. 日期切换；
2. 午餐/晚餐切换；
3. `not_started`、`pending`、`confirmed` 中文状态；
4. 家庭菜品选择器；
5. 合并后的想吃清单及点菜人；
6. 最终菜单编辑器；
7. 409 冲突后刷新并显示“菜单已被其他成员更新”。

- [ ] **Step 5: 运行餐次和并发测试**

Run:

```bash
cd backend
uv run alembic upgrade head
uv run python scripts/export_openapi.py
uv run pytest tests/meals -v
cd ../frontend
npm run api:generate
npm test -- --run src/features/meals
```

Expected: 餐次状态、幂等和版本冲突测试全部通过。

- [ ] **Step 6: 提交点菜模块**

```bash
git add backend frontend
git commit -m "feat: add collaborative meal ordering"
```

---

### Task 5: 实现食材匹配和确定性加权随机

**Files:**
- Create: `backend/app/recommendations/domain.py`
- Create: `backend/app/recommendations/service.py`
- Create: `backend/app/recommendations/router.py`
- Create: `backend/tests/recommendations/test_domain.py`
- Create: `backend/tests/recommendations/test_api.py`
- Create: `frontend/src/features/recommendations/api.ts`
- Create: `frontend/src/features/recommendations/ChooseForMePage.tsx`
- Create: `frontend/src/features/recommendations/IngredientPicker.tsx`
- Create: `frontend/src/features/recommendations/ChooseForMePage.test.tsx`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/openapi.json`
- Modify: `frontend/src/api/generated.ts`

**Interfaces:**
- Produces: `match_ingredients(required: frozenset[str], available: frozenset[str]) -> IngredientMatch`。
- Produces: `recency_weight(last_eaten_on: date | None, today: date) -> Decimal`。
- Produces: `choose_weighted(candidates: Sequence[CandidateDish], rng: random.Random) -> CandidateDish`。
- Produces: `POST /api/recommendations/search` 和 `POST /api/recommendations/random`。

- [ ] **Step 1: 写纯规则的参数化失败测试**

```python
@pytest.mark.parametrize(
    ("days_ago", "expected"),
    [(None, Decimal("1.0")), (2, Decimal("0.2")), (5, Decimal("0.5")),
     (10, Decimal("0.8")), (20, Decimal("1.0"))],
)
def test_recency_weight(days_ago, expected):
    today = date(2026, 8, 10)
    eaten = None if days_ago is None else today - timedelta(days=days_ago)
    assert recency_weight(eaten, today) == expected


def test_ingredient_match_hides_two_missing():
    result = match_ingredients(frozenset({"番茄", "鸡蛋", "牛肉"}), frozenset({"番茄"}))
    assert result.visibility == "hidden"
    assert result.missing == frozenset({"鸡蛋", "牛肉"})


def test_weighted_choice_is_repeatable():
    first = choose_weighted(CANDIDATES, random.Random(42))
    second = choose_weighted(CANDIDATES, random.Random(42))
    assert first.id == second.id
```

- [ ] **Step 2: 运行领域测试并确认失败**

Run: `cd backend && uv run pytest tests/recommendations/test_domain.py -v`

Expected: FAIL because recommendation functions do not exist.

- [ ] **Step 3: 实现无数据库依赖的推荐领域模块**

```python
def recency_weight(last_eaten_on: date | None, today: date) -> Decimal:
    if last_eaten_on is None:
        return Decimal("1.0")
    days = (today - last_eaten_on).days
    if days <= 3:
        return Decimal("0.2")
    if days <= 7:
        return Decimal("0.5")
    if days <= 14:
        return Decimal("0.8")
    return Decimal("1.0")
```

`match_ingredients` returns `ready` for zero missing, `one_missing` for one missing, and `hidden` otherwise. `choose_weighted` uses the supplied `random.Random` instance and raises `NoCandidatesError` for an empty list.

- [ ] **Step 4: 接入 API 和“帮我选”页面**

搜索请求必须使用：

```ts
type RecommendationFilters = {
  cookIds: string[];
  categories: string[];
  availableIngredientIds: string[];
  mealSlotId: string | null;
};
```

页面提供“现在就能做”和“再补一种即可”两个结果组。随机结果显示制作者、匹配条件、缺少食材和上次食用日期；按钮为“就吃这个”和“换一道”。无候选项时显示可放宽的具体筛选条件。

- [ ] **Step 5: 运行推荐模块全部测试**

Run:

```bash
cd backend
uv run python scripts/export_openapi.py
uv run pytest tests/recommendations -v
cd ../frontend
npm run api:generate
npm test -- --run src/features/recommendations
```

Expected: 权重边界、固定种子、食材缺失和空结果测试全部通过。

- [ ] **Step 6: 提交推荐模块**

```bash
git add backend frontend
git commit -m "feat: add ingredient matching and random picks"
```

---

### Task 6: 实现历史菜单和验证指标

**Files:**
- Create: `backend/app/metrics/models.py`
- Create: `backend/app/metrics/schemas.py`
- Create: `backend/app/metrics/service.py`
- Create: `backend/app/metrics/router.py`
- Create: `backend/alembic/versions/0004_metrics.py`
- Create: `backend/tests/metrics/test_metrics.py`
- Create: `frontend/src/features/history/api.ts`
- Create: `frontend/src/features/history/HistoryPage.tsx`
- Create: `frontend/src/features/history/ValidationSummary.tsx`
- Create: `frontend/src/features/history/ValidationSummary.test.tsx`
- Modify: `backend/app/meals/service.py`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/features/households/FamilyPage.tsx`
- Modify: `frontend/openapi.json`
- Modify: `frontend/src/api/generated.ts`

**Interfaces:**
- Produces: `POST /api/events`，只接受白名单事件。
- Produces: `PUT /api/validation-checkins/{week_start}`，记录该周实际家庭用餐数和线下反复讨论次数。
- Produces: `GET /api/history?from=&to=`。
- Produces: `GET /api/metrics/summary?from=&to=`。
- Produces: 服务器自动记录 `menu_confirmed` 和 `menu_modified`，客户端记录 `meal_opened` 与来源。

- [ ] **Step 1: 写指标计算和隐私白名单测试**

```python
def test_summary_calculates_median_confirmation_seconds(client, seeded_events):
    result = client.get("/api/metrics/summary?from=2026-08-01&to=2026-08-14").json()
    assert result["median_confirmation_seconds"] == 150
    assert result["app_decided_meal_ratio"] == 0.75


def test_rejects_unknown_event(client):
    response = client.post("/api/events", json={"name": "location_captured", "properties": {}})
    assert response.status_code == 422


def test_ratio_uses_reported_home_meals_as_denominator(client, three_confirmed_meals):
    client.put(
        "/api/validation-checkins/2026-08-03",
        json={"home_meal_count": 4, "offline_discussion_count": 1},
    )
    result = client.get("/api/metrics/summary?from=2026-08-03&to=2026-08-09").json()
    assert result["app_decided_meal_ratio"] == 0.75
```

Add tests for direct/random/ingredient source counts, confirmation-after-modification count, empty period and cross-household isolation.

- [ ] **Step 2: 运行指标测试并确认失败**

Run: `cd backend && uv run pytest tests/metrics/test_metrics.py -v`

Expected: FAIL because metric tables and summary service do not exist.

- [ ] **Step 3: 实现事件表和汇总查询**

Allowed event names are exactly:

```python
EventName = Literal[
    "meal_opened",
    "first_request_added",
    "menu_confirmed",
    "menu_modified",
]
DecisionSource = Literal["direct", "random", "ingredient"]
```

Properties may contain only `meal_slot_id`, `decision_source`, `request_count` and `participant_count`. The backend derives member, household and timestamp from the authenticated request.

Store one `validation_checkins` row per household and week start. `app_decided_meal_ratio` equals confirmed meal slots divided by the sum of `home_meal_count`; return `null` until a check-in supplies the denominator.

- [ ] **Step 4: 实现历史与两周验证摘要**

历史按日期倒序显示菜单快照和最后修改人。验证摘要显示：

- 通过应用确定菜单的餐次占比；
- 打开到确认的中位秒数；
- 三种决定来源的使用次数；
- 确认后修改次数；
- 点菜数量与确认时间的明细导出。

页面每周收集“实际家庭用餐数”和“线下反复讨论次数”，明确标记两项均为成员手动填写，不把它们伪装成自动采集结果。

- [ ] **Step 5: 验证历史和指标**

Run:

```bash
cd backend
uv run alembic upgrade head
uv run python scripts/export_openapi.py
uv run pytest tests/metrics -v
cd ../frontend
npm run api:generate
npm test -- --run src/features/history
```

Expected: 指标边界和隐私白名单测试全部通过。

- [ ] **Step 6: 提交历史与指标模块**

```bash
git add backend frontend
git commit -m "feat: add meal history and validation metrics"
```

---

### Task 7: 实现可选菜品图片

**Files:**
- Create: `backend/app/images/storage.py`
- Create: `backend/app/images/service.py`
- Create: `backend/app/images/router.py`
- Create: `backend/tests/images/test_images.py`
- Create: `frontend/src/features/images/compressImage.ts`
- Create: `frontend/src/features/images/compressImage.test.ts`
- Create: `frontend/src/features/images/ImageField.tsx`
- Modify: `backend/app/dishes/schemas.py`
- Modify: `backend/app/dishes/service.py`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/features/dishes/DishForm.tsx`
- Modify: `frontend/openapi.json`
- Modify: `frontend/src/api/generated.ts`
- Modify: `compose.yaml`
- Modify: `.env.example`

**Interfaces:**
- Produces: `POST /api/images` multipart upload，返回 `{image_key,image_url}`。
- Produces: `Storage` Protocol with `put()`、`signed_get_url()` 和 `delete()`。
- Produces: `compressImage(file: File) -> Promise<CompressedImage>`。

- [ ] **Step 1: 写格式、大小和存储失败测试**

```python
def test_rejects_oversized_image(client):
    response = client.post(
        "/api/images",
        files={"file": ("dish.jpg", b"x" * (2 * 1024 * 1024 + 1), "image/jpeg")},
    )
    assert response.status_code == 413


def test_storage_failure_does_not_create_dish_image(client, failing_storage):
    response = client.post(
        "/api/images",
        files={"file": ("dish.webp", b"valid-image", "image/webp")},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "image_upload_failed"
```

Use these frontend assertions:

```ts
it("rejects a source file over 10 MB", async () => {
  const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
  await expect(compressImage(file)).rejects.toThrow("图片不能超过 10 MB");
});

it("limits the longest edge to 1600 pixels", async () => {
  mockImageBitmap({ width: 3200, height: 2400 });
  const result = await compressImage(new File([VALID_JPEG], "dish.jpg", { type: "image/jpeg" }));
  expect(result.width).toBe(1600);
  expect(result.height).toBe(1200);
});
```

Expose `{blob, width, height}` so dimensions remain testable:

```ts
type CompressedImage = { blob: Blob; width: number; height: number };
export function compressImage(file: File): Promise<CompressedImage>;
```

- [ ] **Step 2: 运行图片测试并确认失败**

Run:

```bash
cd backend && uv run pytest tests/images/test_images.py -v
cd ../frontend && npm test -- --run src/features/images
```

Expected: FAIL because upload and compression modules do not exist.

- [ ] **Step 3: 实现私有对象存储适配和上传限制**

Run: `cd backend && uv add boto3 python-multipart`

Allow only `image/jpeg`、`image/png` and `image/webp`. Read at most `2 MiB + 1 byte`, reject excess before storage, generate household-prefixed random keys, and return a signed GET URL that expires in 15 minutes. Add MinIO to local Compose and use a fake in-memory `Storage` in tests.

- [ ] **Step 4: 实现浏览器端压缩和非阻塞表单**

Use `createImageBitmap` and Canvas to resize to a longest edge of 1600 pixels, encode WebP at quality `0.82`, and progressively reduce quality until at most 2 MB. If upload fails, keep all text fields and display “图片上传失败，你仍可先保存菜品”；the submitted dish uses `imageKey: null`.

- [ ] **Step 5: 运行图片与菜品回归测试**

Run:

```bash
cd backend
uv run python scripts/export_openapi.py
uv run pytest tests/images tests/dishes -v
cd ../frontend
npm run api:generate
npm test -- --run src/features/images src/features/dishes
```

Expected: 图片限制、失败降级和菜品回归测试全部通过。

- [ ] **Step 6: 提交图片功能**

```bash
git add backend frontend compose.yaml .env.example
git commit -m "feat: add optional private dish images"
```

---

### Task 8: 完成移动导航、PWA 和弱网体验

**Files:**
- Create: `frontend/src/app/AppShell.tsx`
- Create: `frontend/src/app/BottomNav.tsx`
- Create: `frontend/src/app/NetworkBanner.tsx`
- Create: `frontend/src/app/AppShell.test.tsx`
- Create: `frontend/public/manifest.webmanifest`
- Create: `frontend/scripts/generate-icons.mjs`
- Create: `frontend/src/pwa/register.ts`
- Create: `frontend/src/styles/global.css`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: 四个一级入口“今天、菜品、帮我选、家庭”。
- Produces: 可安装 manifest、应用壳缓存和在线状态提示。
- Produces: 未提交表单草稿仅保存在当前页面会话，不提供离线写入队列。

- [ ] **Step 1: 写导航和断网行为测试**

```tsx
it("shows four primary destinations", () => {
  render(<AppShell />);
  for (const name of ["今天", "菜品", "帮我选", "家庭"]) {
    expect(screen.getByRole("link", { name })).toBeVisible();
  }
});

it("explains that writes require a network connection", () => {
  mockNavigatorOnline(false);
  render(<AppShell />);
  expect(screen.getByText("当前离线，可查看已缓存页面，恢复网络后再提交")).toBeVisible();
});
```

- [ ] **Step 2: 运行 PWA 壳测试并确认失败**

Run: `cd frontend && npm test -- --run src/app/AppShell.test.tsx`

Expected: FAIL because AppShell and offline banner do not exist.

- [ ] **Step 3: 实现应用壳、manifest 和受限缓存**

Run: `cd frontend && npm install -D vite-plugin-pwa sharp`

Cache only versioned static assets and GET navigation shell; configure `/api` as `NetworkOnly`, preventing stale household data from being presented as current. Generate 192×192 and 512×512 maskable PNG icons from a committed bowl-and-chopsticks SVG using the `sharp` script.

`manifest.webmanifest` must contain:

```json
{
  "name": "家庭点菜",
  "short_name": "家庭点菜",
  "start_url": "/",
  "display": "standalone",
  "lang": "zh-CN",
  "theme_color": "#b45309",
  "background_color": "#fffaf0"
}
```

- [ ] **Step 4: 实现移动优先样式和无障碍基础**

Use a fixed bottom navigation with safe-area insets, minimum 44×44 pixel interactive targets, visible focus styles, semantic labels, and no horizontal scroll at 320 px width. Disable write buttons while offline but preserve controlled form values.

- [ ] **Step 5: 运行前端测试、构建和 PWA 检查**

Run:

```bash
cd frontend
npm test -- --run
npm run build
```

Expected: 测试和构建退出码为 0；生成目录包含 manifest、service worker、192×192 和 512×512 图标；离线测试确认 API 写入按钮禁用。

- [ ] **Step 6: 提交 PWA 壳**

```bash
git add frontend
git commit -m "feat: add installable mobile PWA shell"
```

---

### Task 9: 完成端到端验收、部署配置和运行文档

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/fixtures.ts`
- Create: `frontend/e2e/household-flow.spec.ts`
- Create: `frontend/e2e/recommendation-flow.spec.ts`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `deploy/Caddyfile`
- Create: `scripts/verify.sh`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: `./scripts/verify.sh` 作为本地与 CI 的统一验收入口。
- Produces: 同源 `/api` 反向代理部署，避免跨站 Cookie。
- Produces: 两个移动浏览器上下文模拟两位家庭成员。

- [ ] **Step 1: 写完整家庭流程端到端测试**

Run: `cd frontend && npm install -D @playwright/test`

```ts
import { devices, expect, test } from "@playwright/test";

test("two members order and confirm dinner", async ({ browser }) => {
  const owner = await browser.newContext({ ...devices["iPhone 13"] });
  const member = await browser.newContext({ ...devices["Pixel 7"] });

  const ownerPage = await owner.newPage();
  await ownerPage.goto("/");
  await ownerPage.getByRole("button", { name: "创建家庭" }).click();
  await ownerPage.getByLabel("家庭名称").fill("我家");
  await ownerPage.getByLabel("昵称").fill("小林");
  await ownerPage.getByLabel("PIN").fill("1234");
  await ownerPage.getByRole("button", { name: "确认创建" }).click();

  const invite = await ownerPage.getByTestId("invite-code").textContent();
  const memberPage = await member.newPage();
  await memberPage.goto("/");
  await memberPage.getByRole("button", { name: "加入家庭" }).click();
  await memberPage.getByLabel("邀请码").fill(invite!);
  await memberPage.getByLabel("昵称").fill("小周");
  await memberPage.getByLabel("PIN").fill("5678");
  await memberPage.getByRole("button", { name: "确认加入" }).click();

  await expect(memberPage.getByText("今天吃什么？")).toBeVisible();

  const sessionResponse = await ownerPage.request.get("/api/session");
  const session = await sessionResponse.json();
  const dishes = Array.from({ length: 15 }, (_, index) => ({
    name: index === 0 ? "番茄炒蛋" : `家常菜${index + 1}`,
    category: index === 0 ? "荤菜" : "其他",
    cook_ids: [session.member.id],
    ingredients: index === 0 ? ["番茄", "鸡蛋"] : [`食材${index + 1}`],
  }));
  for (const dish of dishes) {
    const response = await ownerPage.request.post("/api/dishes", { data: dish });
    expect(response.ok()).toBeTruthy();
  }

  await ownerPage.goto("/today");
  await ownerPage.getByRole("button", { name: "晚餐" }).click();
  await ownerPage.getByRole("button", { name: "点番茄炒蛋" }).click();
  await memberPage.goto("/today");
  await memberPage.getByRole("button", { name: "晚餐" }).click();
  await memberPage.getByRole("button", { name: "点番茄炒蛋" }).click();

  await expect(memberPage.getByTestId("requesters-番茄炒蛋")).toHaveText("小林、小周");
  await memberPage.getByRole("button", { name: "加入最终菜单：番茄炒蛋" }).click();
  await memberPage.getByRole("button", { name: "确认菜单" }).click();
  await ownerPage.reload();
  await expect(ownerPage.getByText("最后修改：小周")).toBeVisible();
});
```

Use `frontend/e2e/fixtures.ts` to create a fresh database schema per Playwright worker and clear it after the worker exits, so repeated runs do not reuse household names or sessions.

- [ ] **Step 2: 写随机、食材和历史端到端测试**

Seed dishes with known ingredients and last-eaten dates, set the test random seed through a test-only environment variable, then assert:

```ts
await page.getByRole("link", { name: "帮我选" }).click();
await page.getByLabel("番茄").check();
await expect(page.getByRole("heading", { name: "现在就能做" })).toBeVisible();
await page.getByRole("button", { name: "就吃这个" }).click();
await expect(page.getByText("已加入今晚想吃清单")).toBeVisible();
const selectedDishId = await page.getByTestId("selected-dish").getAttribute("data-dish-id");
expect(selectedDishId).not.toBeNull();
await page.getByRole("button", { name: "确认菜单" }).click();
const renameResponse = await page.request.patch(`/api/dishes/${selectedDishId}`, {
  data: { name: "新的菜名" },
});
expect(renameResponse.ok()).toBeTruthy();
await page.getByRole("link", { name: "家庭" }).click();
await page.getByRole("link", { name: "历史菜单" }).click();
await expect(page.getByText("番茄炒蛋")).toBeVisible();
await expect(page.getByText("新的菜名")).not.toBeVisible();
```

- [ ] **Step 3: 运行端到端测试并修复实际暴露的问题**

Run:

```bash
docker compose up -d --build
cd frontend
npx playwright install --with-deps chromium
npm run test:e2e
```

Expected: 两成员协作、随机、食材匹配和历史快照流程全部通过。

- [ ] **Step 4: 编写统一验证脚本和部署说明**

Use these deployment entry points:

```dockerfile
# backend/Dockerfile
FROM python:3.14-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```dockerfile
# frontend/Dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

```nginx
# frontend/nginx.conf
server {
  listen 80;
  root /usr/share/nginx/html;
  location / { try_files $uri /index.html; }
}
```

```caddyfile
# deploy/Caddyfile
:80 {
  handle /api/* {
    reverse_proxy backend:8000
  }
  handle {
    reverse_proxy frontend:80
  }
}
```

```bash
# scripts/verify.sh
#!/usr/bin/env bash
set -euo pipefail

uv run --directory backend ruff check .
uv run --directory backend mypy app
uv run --directory backend pytest tests -v
npm --prefix frontend test -- --run
npm --prefix frontend run build
npm --prefix frontend run test:e2e
```

README contains exact commands for prerequisites、environment variables、migrations、local startup、tests、production same-origin proxy、backup/restore、invite recovery and the two-week validation procedure.

- [ ] **Step 5: 运行完整验收**

Run: `./scripts/verify.sh`

Expected: Ruff、mypy、全部后端测试、全部前端测试、生产构建和 Playwright 测试均以退出码 0 完成。

- [ ] **Step 6: 提交验收与部署资产**

```bash
git add backend frontend deploy scripts compose.yaml .env.example README.md
git commit -m "test: add full family menu acceptance flow"
```

---

## Final Verification

- [ ] Run `docker compose up -d --build` and confirm PostgreSQL、object storage、API and frontend are healthy.
- [ ] Run `uv run --directory backend alembic upgrade head` against an empty database.
- [ ] Run `./scripts/verify.sh` and require every command to exit with code 0.
- [ ] Manually install the PWA in current mobile Chrome and Safari, then complete one meal flow on each.
- [ ] Use two devices or browser contexts to confirm member isolation, merged requests and refocus synchronization.
- [ ] Confirm no request can read or mutate another household by running the cross-household integration suite.
- [ ] Confirm the validation summary reports the seeded 70% meal ratio and 150-second median exactly.
