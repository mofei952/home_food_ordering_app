from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _create_household(
    client: TestClient,
    *,
    household_name: str = "我家",
    owner_name: str = "小林",
    pin: str = "1234",
) -> object:
    return client.post(
        "/api/households",
        json={
            "household_name": household_name,
            "owner_name": owner_name,
            "pin": pin,
            "timezone": "Asia/Shanghai",
        },
    )


@pytest.fixture(autouse=True)
def authenticated_household(
    client: TestClient, request: pytest.FixtureRequest
) -> None:
    """Ensure every dish test runs with an authenticated household session."""
    if "members" in request.fixturenames or "foreign_member" in request.fixturenames:
        return
    created = _create_household(client)
    assert created.status_code == 201


@pytest.fixture
def members(client: TestClient) -> SimpleNamespace:
    created = _create_household(client)
    assert created.status_code == 201
    invite_code = created.json()["invite_code"]
    owner_id = UUID(created.json()["member"]["id"])

    joined = client.post(
        "/api/households/join",
        json={"invite_code": invite_code, "nickname": "小周", "pin": "5678"},
    )
    assert joined.status_code == 201
    other_id = UUID(joined.json()["member"]["id"])

    reauth = client.post(
        "/api/households/join",
        json={"invite_code": invite_code, "nickname": "小林", "pin": "1234"},
    )
    assert reauth.status_code == 200

    return SimpleNamespace(
        owner=SimpleNamespace(id=owner_id),
        other=SimpleNamespace(id=other_id),
        invite_code=invite_code,
    )


@pytest.fixture
def foreign_member(client: TestClient, app: FastAPI) -> SimpleNamespace:
    created = _create_household(client)
    assert created.status_code == 201

    with TestClient(app) as other_client:
        foreign = _create_household(
            other_client,
            household_name="别家",
            owner_name="外人",
            pin="9999",
        )
        assert foreign.status_code == 201
        return SimpleNamespace(id=UUID(foreign.json()["member"]["id"]))


def test_create_dish_with_multiple_cooks_and_ingredients(
    client: TestClient, members: SimpleNamespace
) -> None:
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


def test_alias_matches_canonical_ingredient(client: TestClient) -> None:
    tomato = client.post(
        "/api/ingredients", json={"name": "番茄", "aliases": ["西红柿"]}
    ).json()
    results = client.get("/api/ingredients?query=西红柿").json()
    assert results[0]["id"] == tomato["id"]


def test_dish_requires_an_ingredient(
    client: TestClient, members: SimpleNamespace
) -> None:
    response = client.post(
        "/api/dishes",
        json={
            "name": "白饭",
            "category": "主食",
            "cook_ids": [str(members.owner.id)],
            "ingredients": [],
        },
    )
    assert response.status_code == 422


def test_cannot_assign_cook_from_another_household(
    client: TestClient, foreign_member: SimpleNamespace
) -> None:
    response = client.post(
        "/api/dishes",
        json={
            "name": "炒饭",
            "category": "主食",
            "cook_ids": [str(foreign_member.id)],
            "ingredients": ["米饭"],
        },
    )
    assert response.status_code == 404


def test_duplicate_names_with_different_cooks_are_allowed(
    client: TestClient, members: SimpleNamespace
) -> None:
    first = client.post(
        "/api/dishes",
        json={
            "name": "炒饭",
            "category": "主食",
            "cook_ids": [str(members.owner.id)],
            "ingredients": ["米饭"],
        },
    )
    second = client.post(
        "/api/dishes",
        json={
            "name": "炒饭",
            "category": "主食",
            "cook_ids": [str(members.other.id)],
            "ingredients": ["米饭", "鸡蛋"],
        },
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


def test_delete_archives_dish(
    client: TestClient, members: SimpleNamespace
) -> None:
    created = client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [str(members.owner.id)],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    assert created.status_code == 201
    dish_id = created.json()["id"]

    deleted = client.delete(f"/api/dishes/{dish_id}")
    assert deleted.status_code == 200
    assert deleted.json()["archived_at"] is not None


def test_default_list_excludes_archived_dishes(
    client: TestClient, members: SimpleNamespace
) -> None:
    active = client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [str(members.owner.id)],
            "ingredients": ["番茄"],
        },
    ).json()
    archived = client.post(
        "/api/dishes",
        json={
            "name": "白饭",
            "category": "主食",
            "cook_ids": [str(members.owner.id)],
            "ingredients": ["米饭"],
        },
    ).json()
    client.delete(f"/api/dishes/{archived['id']}")

    listed = client.get("/api/dishes")
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json()}
    assert active["id"] in ids
    assert archived["id"] not in ids


def test_list_filters_by_cook_and_category(
    client: TestClient, members: SimpleNamespace
) -> None:
    client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [str(members.owner.id)],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    client.post(
        "/api/dishes",
        json={
            "name": "青菜",
            "category": "素菜",
            "cook_ids": [str(members.other.id)],
            "ingredients": ["青菜"],
        },
    )

    by_category = client.get("/api/dishes", params={"category": "荤菜"})
    assert by_category.status_code == 200
    assert [item["name"] for item in by_category.json()] == ["番茄炒蛋"]

    by_cook = client.get(
        "/api/dishes", params={"cook_id": str(members.other.id)}
    )
    assert by_cook.status_code == 200
    assert [item["name"] for item in by_cook.json()] == ["青菜"]


def test_patch_and_get_dish(
    client: TestClient, members: SimpleNamespace
) -> None:
    created = client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [str(members.owner.id)],
            "ingredients": ["番茄", "鸡蛋"],
            "image_key": None,
        },
    )
    dish_id = created.json()["id"]
    patched = client.patch(
        f"/api/dishes/{dish_id}",
        json={
            "name": "西红柿炒蛋",
            "category": "素菜",
            "cook_ids": [str(members.other.id)],
            "ingredients": ["西红柿", "鸡蛋"],
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["name"] == "西红柿炒蛋"
    assert body["category"] == "素菜"
    assert {cook["id"] for cook in body["cooks"]} == {str(members.other.id)}
    assert body["image_url"] is None

    fetched = client.get(f"/api/dishes/{dish_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "西红柿炒蛋"
    assert UUID(fetched.json()["id"]) == UUID(dish_id)
