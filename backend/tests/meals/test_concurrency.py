from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient


def _create_household(client: TestClient) -> dict:
    created = client.post(
        "/api/households",
        json={
            "household_name": "我家",
            "owner_name": "小林",
            "pin": "1234",
            "timezone": "Asia/Shanghai",
        },
    )
    assert created.status_code == 201
    return created.json()


@pytest.fixture
def household(client: TestClient) -> dict:
    return _create_household(client)


@pytest.fixture
def dish(client: TestClient, household: dict) -> SimpleNamespace:
    created = client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [household["member"]["id"]],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    assert created.status_code == 201
    return SimpleNamespace(id=UUID(created.json()["id"]))


@pytest.fixture
def slot(client: TestClient, household: dict) -> SimpleNamespace:
    response = client.get("/api/meal-slots/2026-08-10/dinner")
    assert response.status_code == 200
    return SimpleNamespace(id=UUID(response.json()["id"]))


def test_menu_version_conflict_is_idempotent_under_stale_retry(
    client: TestClient, slot: SimpleNamespace, dish: SimpleNamespace
) -> None:
    """Simulate a race: two writers hold expected_version=0; only one wins."""
    first = client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [str(dish.id)], "expected_version": 0},
    )
    assert first.status_code == 200
    assert first.json()["version"] == 1

    stale = client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [], "expected_version": 0},
    )
    assert stale.status_code == 409
    assert stale.json() == {"detail": stale.json()["detail"], "code": "version_conflict", "current_version": 1}

    # Retry with refreshed version succeeds and is idempotent for empty menu.
    refreshed = client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [], "expected_version": 1},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["version"] == 2
    assert refreshed.json()["menu"] == []
    assert refreshed.json()["status"] == "confirmed"

    again = client.put(
        f"/api/meal-slots/{slot.id}/menu",
        json={"dish_ids": [], "expected_version": 2},
    )
    assert again.status_code == 200
    assert again.json()["version"] == 3
    assert again.json()["menu"] == []
