from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient


def _create_household(client: TestClient) -> dict:
    response = client.post(
        "/api/households",
        json={
            "household_name": "我家",
            "owner_name": "小林",
            "pin": "1234",
            "timezone": "Asia/Shanghai",
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def household(client: TestClient) -> dict:
    return _create_household(client)


@pytest.fixture
def catalog(client: TestClient, household: dict) -> SimpleNamespace:
    owner_id = household["member"]["id"]
    tomato_egg = client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [owner_id],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    assert tomato_egg.status_code == 201
    tomato_egg_body = tomato_egg.json()

    greens = client.post(
        "/api/dishes",
        json={
            "name": "青菜",
            "category": "素菜",
            "cook_ids": [owner_id],
            "ingredients": ["青菜"],
        },
    )
    assert greens.status_code == 201
    greens_body = greens.json()

    beef = client.post(
        "/api/dishes",
        json={
            "name": "番茄牛腩",
            "category": "荤菜",
            "cook_ids": [owner_id],
            "ingredients": ["番茄", "牛肉", "土豆"],
        },
    )
    assert beef.status_code == 201
    beef_body = beef.json()

    ingredients = {
        item["name"]: item["id"]
        for dish in (tomato_egg_body, greens_body, beef_body)
        for item in dish["ingredients"]
    }
    return SimpleNamespace(
        owner_id=owner_id,
        tomato_egg=tomato_egg_body,
        greens=greens_body,
        beef=beef_body,
        ingredients=ingredients,
    )


def test_search_groups_ready_and_one_missing(
    client: TestClient, catalog: SimpleNamespace
) -> None:
    tomato_id = catalog.ingredients["番茄"]
    response = client.post(
        "/api/recommendations/search",
        json={
            "cook_ids": [],
            "categories": [],
            "available_ingredient_ids": [tomato_id],
            "meal_slot_id": None,
        },
    )
    assert response.status_code == 200
    body = response.json()
    ready_names = {item["name"] for item in body["ready"]}
    one_missing_names = {item["name"] for item in body["one_missing"]}
    assert ready_names == set()
    assert one_missing_names == {"番茄炒蛋", "青菜"}
    assert "番茄牛腩" not in one_missing_names
    tomato_egg = next(
        item for item in body["one_missing"] if item["name"] == "番茄炒蛋"
    )
    assert {item["name"] for item in tomato_egg["missing_ingredients"]} == {"鸡蛋"}
    assert tomato_egg["visibility"] == "one_missing"


def test_search_ready_when_all_ingredients_available(
    client: TestClient, catalog: SimpleNamespace
) -> None:
    response = client.post(
        "/api/recommendations/search",
        json={
            "cook_ids": [],
            "categories": [],
            "available_ingredient_ids": [
                catalog.ingredients["番茄"],
                catalog.ingredients["鸡蛋"],
            ],
            "meal_slot_id": None,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert {item["name"] for item in body["ready"]} == {"番茄炒蛋"}
    assert {item["name"] for item in body["one_missing"]} == {"青菜"}
    assert all(
        item["name"] != "番茄牛腩"
        for item in body["ready"] + body["one_missing"]
    )


def test_empty_candidates_lists_relaxable_filters(
    client: TestClient, catalog: SimpleNamespace
) -> None:
    response = client.post(
        "/api/recommendations/search",
        json={
            "cook_ids": [str(catalog.owner_id)],
            "categories": ["汤"],
            "available_ingredient_ids": [catalog.ingredients["番茄"]],
            "meal_slot_id": None,
        },
    )
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "no_candidates"
    assert "放宽" in body["detail"]
    assert set(body["relaxable_filters"]) == {
        "cook_ids",
        "categories",
        "available_ingredient_ids",
    }


def test_random_with_seed_is_repeatable(
    client: TestClient, catalog: SimpleNamespace
) -> None:
    payload = {
        "cook_ids": [],
        "categories": ["荤菜"],
        "available_ingredient_ids": [],
        "meal_slot_id": None,
        "seed": 42,
    }
    first = client.post("/api/recommendations/random", json=payload)
    second = client.post("/api/recommendations/random", json=payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["dish"]["id"] == second.json()["dish"]["id"]


def test_last_eaten_on_from_confirmed_menu(
    client: TestClient, catalog: SimpleNamespace
) -> None:
    dish_id = catalog.tomato_egg["id"]
    slot = client.get("/api/meal-slots/2026-08-01/dinner").json()
    confirmed = client.put(
        f"/api/meal-slots/{slot['id']}/menu",
        json={"dish_ids": [dish_id], "expected_version": 0},
    )
    assert confirmed.status_code == 200

    response = client.post(
        "/api/recommendations/search",
        json={
            "cook_ids": [],
            "categories": [],
            "available_ingredient_ids": [],
            "meal_slot_id": None,
        },
    )
    assert response.status_code == 200
    tomato_egg = next(
        item for item in response.json()["ready"] if item["id"] == dish_id
    )
    assert tomato_egg["last_eaten_on"] == "2026-08-01"
    greens = next(
        item
        for item in response.json()["ready"]
        if item["id"] == catalog.greens["id"]
    )
    assert greens["last_eaten_on"] is None


def test_search_filters_by_cook_and_category(
    client: TestClient, household: dict
) -> None:
    owner_id = household["member"]["id"]
    invite = household["invite_code"]
    other = client.post(
        "/api/households/join",
        json={"invite_code": invite, "nickname": "小周", "pin": "5678"},
    )
    assert other.status_code == 201
    other_id = other.json()["member"]["id"]
    client.post(
        "/api/households/join",
        json={"invite_code": invite, "nickname": "小林", "pin": "1234"},
    )

    client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [owner_id],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    client.post(
        "/api/dishes",
        json={
            "name": "青菜",
            "category": "素菜",
            "cook_ids": [other_id],
            "ingredients": ["青菜"],
        },
    )

    response = client.post(
        "/api/recommendations/search",
        json={
            "cook_ids": [other_id],
            "categories": ["素菜"],
            "available_ingredient_ids": [],
            "meal_slot_id": None,
        },
    )
    assert response.status_code == 200
    names = {item["name"] for item in response.json()["ready"]}
    assert names == {"青菜"}


def test_random_empty_candidates(
    client: TestClient, catalog: SimpleNamespace
) -> None:
    response = client.post(
        "/api/recommendations/random",
        json={
            "cook_ids": [],
            "categories": ["汤"],
            "available_ingredient_ids": [],
            "meal_slot_id": None,
            "seed": 1,
        },
    )
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "no_candidates"
    assert body["relaxable_filters"] == ["categories"]


def test_meal_slot_id_echoed(
    client: TestClient, catalog: SimpleNamespace
) -> None:
    slot = client.get("/api/meal-slots/2026-08-10/lunch").json()
    response = client.post(
        "/api/recommendations/random",
        json={
            "cook_ids": [],
            "categories": [],
            "available_ingredient_ids": [],
            "meal_slot_id": slot["id"],
            "seed": 7,
        },
    )
    assert response.status_code == 200
    assert response.json()["meal_slot_id"] == slot["id"]
    assert UUID(response.json()["dish"]["id"])
