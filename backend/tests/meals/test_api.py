from datetime import UTC, date, datetime
from types import SimpleNamespace
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _create_household(
    client: TestClient,
    *,
    household_name: str = "我家",
    owner_name: str = "小林",
    pin: str = "1234",
    timezone: str = "Asia/Shanghai",
) -> object:
    return client.post(
        "/api/households",
        json={
            "household_name": household_name,
            "owner_name": owner_name,
            "pin": pin,
            "timezone": timezone,
        },
    )


@pytest.fixture
def household(client: TestClient) -> dict:
    created = _create_household(client)
    assert created.status_code == 201
    return created.json()


@pytest.fixture
def other_client(app: FastAPI, household: dict) -> TestClient:
    with TestClient(app) as other:
        joined = other.post(
            "/api/households/join",
            json={
                "invite_code": household["invite_code"],
                "nickname": "小周",
                "pin": "5678",
            },
        )
        assert joined.status_code == 201
        yield other


@pytest.fixture
def dish(client: TestClient, household: dict) -> SimpleNamespace:
    owner_id = household["member"]["id"]
    created = client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [owner_id],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    assert created.status_code == 201
    body = created.json()
    return SimpleNamespace(id=UUID(body["id"]), name=body["name"])


@pytest.fixture
def slot(client: TestClient, household: dict) -> SimpleNamespace:
    response = client.get("/api/meal-slots/2026-08-10/dinner")
    assert response.status_code == 200
    body = response.json()
    return SimpleNamespace(
        id=UUID(body["id"]),
        local_date=body["local_date"],
        meal_type=body["meal_type"],
    )


def test_same_dish_requests_are_merged(
    client: TestClient, other_client: TestClient, dish: SimpleNamespace, household: dict
) -> None:
    slot = client.get("/api/meal-slots/2026-08-10/dinner").json()
    client.put(f"/api/meal-slots/{slot['id']}/requests/{dish.id}")
    other_client.put(f"/api/meal-slots/{slot['id']}/requests/{dish.id}")

    result = client.get("/api/meal-slots/2026-08-10/dinner").json()
    request = result["requests"][0]
    assert request["dish_id"] == str(dish.id)
    assert len(request["requested_by"]) == 2
    assert result["status"] == "pending"


def test_any_member_can_confirm_menu(
    other_client: TestClient, slot: SimpleNamespace, dish: SimpleNamespace
) -> None:
    response = other_client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [str(dish.id)], "expected_version": 0},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


def test_member_can_only_withdraw_own_request(
    client: TestClient,
    other_client: TestClient,
    slot: SimpleNamespace,
    dish: SimpleNamespace,
) -> None:
    other_client.put(f"/api/meal-slots/{slot.id}/requests/{dish.id}")
    response = client.delete(f"/api/meal-slots/{slot.id}/requests/{dish.id}")
    assert response.status_code == 204
    result = other_client.get(
        f"/api/meal-slots/{slot.local_date}/{slot.meal_type}"
    ).json()
    assert result["requests"][0]["requested_by"] != []


def test_stale_menu_version_returns_conflict(
    client: TestClient, slot: SimpleNamespace, dish: SimpleNamespace
) -> None:
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
    assert response.json()["current_version"] == 1


def test_accepts_more_than_ten_requests(
    client: TestClient, household: dict
) -> None:
    owner_id = household["member"]["id"]
    dishes = []
    for index in range(11):
        created = client.post(
            "/api/dishes",
            json={
                "name": f"菜品{index}",
                "category": "其他",
                "cook_ids": [owner_id],
                "ingredients": [f"食材{index}"],
            },
        )
        assert created.status_code == 201
        dishes.append(created.json()["id"])

    slot = client.get("/api/meal-slots/2026-08-10/lunch").json()
    for dish_id in dishes:
        response = client.put(f"/api/meal-slots/{slot['id']}/requests/{dish_id}")
        assert response.status_code == 200

    result = client.get("/api/meal-slots/2026-08-10/lunch").json()
    assert len(result["requests"]) == 11


def test_menu_accepts_unrequested_active_dish(
    client: TestClient, slot: SimpleNamespace, dish: SimpleNamespace
) -> None:
    response = client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [str(dish.id)], "expected_version": 0},
    )
    assert response.status_code == 200
    menu = response.json()["menu"]
    assert len(menu) == 1
    assert menu[0]["dish_id"] == str(dish.id)
    assert menu[0]["dish_name"] == dish.name


def test_menu_rejects_archived_dish(
    client: TestClient, slot: SimpleNamespace, dish: SimpleNamespace
) -> None:
    archived = client.delete(f"/api/dishes/{dish.id}")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None

    response = client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [str(dish.id)], "expected_version": 0},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "dish_archived"
    assert response.json()["detail"] == "已归档菜品不能加入菜单"


def test_request_rejects_archived_dish(
    client: TestClient, slot: SimpleNamespace, dish: SimpleNamespace
) -> None:
    archived = client.delete(f"/api/dishes/{dish.id}")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None

    response = client.put(f"/api/meal-slots/{slot.id}/requests/{dish.id}")
    assert response.status_code == 422
    assert response.json()["code"] == "dish_archived"
    assert response.json()["detail"] == "已归档菜品不能点选"


def test_duplicate_request_is_idempotent(
    client: TestClient, slot: SimpleNamespace, dish: SimpleNamespace
) -> None:
    first = client.put(f"/api/meal-slots/{slot.id}/requests/{dish.id}")
    second = client.put(f"/api/meal-slots/{slot.id}/requests/{dish.id}")
    assert first.status_code == 200
    assert second.status_code == 200

    result = client.get(f"/api/meal-slots/{slot.local_date}/{slot.meal_type}").json()
    assert len(result["requests"]) == 1
    assert len(result["requests"][0]["requested_by"]) == 1


def test_meal_date_uses_household_timezone(
    client: TestClient, household: dict
) -> None:
    assert household["household"]["timezone"] == "Asia/Shanghai"
    # 2026-08-10 16:30 UTC == 2026-08-11 00:30 Asia/Shanghai
    utc_moment = datetime(2026, 8, 10, 16, 30, tzinfo=UTC)
    local_today = utc_moment.astimezone(ZoneInfo("Asia/Shanghai")).date()
    assert local_today == date(2026, 8, 11)

    response = client.get(f"/api/meal-slots/{local_today.isoformat()}/dinner")
    assert response.status_code == 200
    body = response.json()
    assert body["local_date"] == "2026-08-11"
    assert body["meal_type"] == "dinner"
    assert body["status"] == "not_started"
