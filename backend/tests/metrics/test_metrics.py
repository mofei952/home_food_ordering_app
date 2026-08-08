"""Metrics, activity events, validation check-ins, and meal history."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.common import models as common_models


class FrozenClock:
    """Controllable UTC clock for activity event timestamps."""

    def __init__(self, start: datetime) -> None:
        self._now = start

    def __call__(self) -> datetime:
        return self._now

    def set(self, value: datetime) -> None:
        self._now = value

    def advance(self, seconds: float) -> None:
        self._now = self._now + timedelta(seconds=seconds)


@pytest.fixture
def frozen_clock(monkeypatch: pytest.MonkeyPatch) -> FrozenClock:
    clock = FrozenClock(datetime(2026, 8, 3, 12, 0, 0, tzinfo=UTC))
    monkeypatch.setattr(common_models, "utc_now", clock)
    return clock


def _create_household(
    client: TestClient,
    *,
    household_name: str = "我家",
    owner_name: str = "小林",
    pin: str = "1234",
) -> dict:
    response = client.post(
        "/api/households",
        json={
            "household_name": household_name,
            "owner_name": owner_name,
            "pin": pin,
            "timezone": "Asia/Shanghai",
        },
    )
    assert response.status_code == 201
    return response.json()


def _create_dish(client: TestClient, owner_id: str, name: str = "番茄炒蛋") -> UUID:
    created = client.post(
        "/api/dishes",
        json={
            "name": name,
            "category": "荤菜",
            "cook_ids": [owner_id],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    assert created.status_code == 201
    return UUID(created.json()["id"])


def _get_slot(client: TestClient, local_date: str, meal_type: str) -> dict:
    response = client.get(f"/api/meal-slots/{local_date}/{meal_type}")
    assert response.status_code == 200
    return response.json()


def _confirm(
    client: TestClient, slot_id: str, dish_id: UUID, expected_version: int = 0
) -> dict:
    response = client.put(
        f"/api/meal-slots/{slot_id}/menu",
        json={"dish_ids": [str(dish_id)], "expected_version": expected_version},
    )
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def household(client: TestClient, frozen_clock: FrozenClock) -> dict:
    del frozen_clock  # ensure clock is active before household creation
    return _create_household(client)


@pytest.fixture
def dish(client: TestClient, household: dict) -> UUID:
    return _create_dish(client, household["member"]["id"])


@pytest.fixture
def seeded_events(
    client: TestClient,
    household: dict,
    dish: UUID,
    frozen_clock: FrozenClock,
) -> SimpleNamespace:
    """Three confirmed meals with open→confirm durations 100 / 150 / 200s."""
    owner_id = household["member"]["id"]
    dishes = [
        dish,
        _create_dish(client, owner_id, "青椒肉丝"),
        _create_dish(client, owner_id, "炒青菜"),
    ]
    slots_spec = [
        ("2026-08-03", "lunch", 100, "direct"),
        ("2026-08-04", "dinner", 150, "random"),
        ("2026-08-05", "lunch", 200, "ingredient"),
    ]
    slot_ids: list[str] = []
    base = datetime(2026, 8, 3, 4, 0, 0, tzinfo=UTC)  # local morning
    for index, (local_date, meal_type, duration, source) in enumerate(slots_spec):
        frozen_clock.set(base + timedelta(days=index))
        slot = _get_slot(client, local_date, meal_type)
        slot_ids.append(slot["id"])
        client.put(f"/api/meal-slots/{slot['id']}/requests/{dishes[index]}")
        opened = client.post(
            "/api/events",
            json={
                "name": "meal_opened",
                "properties": {
                    "meal_slot_id": slot["id"],
                    "decision_source": source,
                    "request_count": 1,
                    "participant_count": 1,
                },
            },
        )
        assert opened.status_code == 201
        frozen_clock.advance(duration)
        _confirm(client, slot["id"], dishes[index], expected_version=0)

    checkin = client.put(
        "/api/validation-checkins/2026-08-03",
        json={"home_meal_count": 4, "offline_discussion_count": 1},
    )
    assert checkin.status_code == 200
    return SimpleNamespace(slot_ids=slot_ids, dishes=dishes)


@pytest.fixture
def three_confirmed_meals(
    client: TestClient,
    household: dict,
    dish: UUID,
    frozen_clock: FrozenClock,
) -> SimpleNamespace:
    del frozen_clock
    owner_id = household["member"]["id"]
    dishes = [
        dish,
        _create_dish(client, owner_id, "红烧肉"),
        _create_dish(client, owner_id, "冬瓜汤"),
    ]
    specs = [
        ("2026-08-03", "lunch"),
        ("2026-08-04", "dinner"),
        ("2026-08-05", "lunch"),
    ]
    slot_ids: list[str] = []
    for index, (local_date, meal_type) in enumerate(specs):
        slot = _get_slot(client, local_date, meal_type)
        slot_ids.append(slot["id"])
        _confirm(client, slot["id"], dishes[index])
    return SimpleNamespace(slot_ids=slot_ids)


def test_summary_calculates_median_confirmation_seconds(
    client: TestClient, seeded_events: SimpleNamespace
) -> None:
    del seeded_events
    result = client.get(
        "/api/metrics/summary?from=2026-08-01&to=2026-08-14"
    ).json()
    assert result["median_confirmation_seconds"] == 150
    assert result["app_decided_meal_ratio"] == 0.75


def test_rejects_unknown_event(client: TestClient, household: dict) -> None:
    del household
    response = client.post(
        "/api/events", json={"name": "location_captured", "properties": {}}
    )
    assert response.status_code == 422


def test_rejects_unknown_event_property(
    client: TestClient, household: dict, dish: UUID
) -> None:
    del dish
    slot = _get_slot(client, "2026-08-03", "dinner")
    response = client.post(
        "/api/events",
        json={
            "name": "meal_opened",
            "properties": {
                "meal_slot_id": slot["id"],
                "gps_lat": 31.2,
            },
        },
    )
    assert response.status_code == 422


def test_ratio_uses_reported_home_meals_as_denominator(
    client: TestClient, three_confirmed_meals: SimpleNamespace
) -> None:
    del three_confirmed_meals
    client.put(
        "/api/validation-checkins/2026-08-03",
        json={"home_meal_count": 4, "offline_discussion_count": 1},
    )
    result = client.get(
        "/api/metrics/summary?from=2026-08-03&to=2026-08-09"
    ).json()
    assert result["app_decided_meal_ratio"] == 0.75


def test_ratio_null_until_checkin_exists(
    client: TestClient, three_confirmed_meals: SimpleNamespace
) -> None:
    del three_confirmed_meals
    result = client.get(
        "/api/metrics/summary?from=2026-08-03&to=2026-08-09"
    ).json()
    assert result["app_decided_meal_ratio"] is None


def test_decision_source_counts(
    client: TestClient, seeded_events: SimpleNamespace
) -> None:
    del seeded_events
    result = client.get(
        "/api/metrics/summary?from=2026-08-01&to=2026-08-14"
    ).json()
    assert result["decision_source_counts"] == {
        "direct": 1,
        "random": 1,
        "ingredient": 1,
    }


def test_confirmation_after_modification_count(
    client: TestClient,
    household: dict,
    dish: UUID,
    frozen_clock: FrozenClock,
) -> None:
    del household, frozen_clock
    slot = _get_slot(client, "2026-08-06", "dinner")
    confirmed = _confirm(client, slot["id"], dish, expected_version=0)
    assert confirmed["status"] == "confirmed"
    modified = client.put(
        f"/api/meal-slots/{slot['id']}/menu",
        json={"dish_ids": [str(dish)], "expected_version": 1},
    )
    assert modified.status_code == 200
    result = client.get(
        "/api/metrics/summary?from=2026-08-01&to=2026-08-14"
    ).json()
    assert result["menu_modified_count"] == 1


def test_empty_period_returns_null_metrics(
    client: TestClient, household: dict
) -> None:
    del household
    result = client.get(
        "/api/metrics/summary?from=2026-01-01&to=2026-01-07"
    ).json()
    assert result["median_confirmation_seconds"] is None
    assert result["app_decided_meal_ratio"] is None
    assert result["decision_source_counts"] == {
        "direct": 0,
        "random": 0,
        "ingredient": 0,
    }
    assert result["menu_modified_count"] == 0
    assert result["confirmation_details"] == []


def test_cross_household_isolation(
    app: FastAPI,
    client: TestClient,
    seeded_events: SimpleNamespace,
    frozen_clock: FrozenClock,
) -> None:
    del seeded_events, frozen_clock
    with TestClient(app) as other:
        other_household = _create_household(
            other, household_name="邻家", owner_name="小邻", pin="9999"
        )
        dish = _create_dish(other, other_household["member"]["id"], "邻家菜")
        slot = _get_slot(other, "2026-08-04", "dinner")
        other.post(
            "/api/events",
            json={
                "name": "meal_opened",
                "properties": {
                    "meal_slot_id": slot["id"],
                    "decision_source": "direct",
                },
            },
        )
        _confirm(other, slot["id"], dish)
        other.put(
            "/api/validation-checkins/2026-08-03",
            json={"home_meal_count": 1, "offline_discussion_count": 0},
        )
        other_summary = other.get(
            "/api/metrics/summary?from=2026-08-01&to=2026-08-14"
        ).json()
        assert other_summary["app_decided_meal_ratio"] == 1.0
        assert other_summary["decision_source_counts"]["direct"] == 1
        assert other_summary["decision_source_counts"]["random"] == 0

    own = client.get(
        "/api/metrics/summary?from=2026-08-01&to=2026-08-14"
    ).json()
    assert own["app_decided_meal_ratio"] == 0.75
    assert own["decision_source_counts"] == {
        "direct": 1,
        "random": 1,
        "ingredient": 1,
    }


def test_history_lists_confirmed_menus_newest_first(
    client: TestClient, seeded_events: SimpleNamespace
) -> None:
    result = client.get("/api/history?from=2026-08-01&to=2026-08-14").json()
    assert len(result) == 3
    dates = [entry["local_date"] for entry in result]
    assert dates == sorted(dates, reverse=True)
    for entry in result:
        assert entry["menu"]
        assert entry["last_modified_by"]["nickname"] == "小林"
        assert entry["menu"][0]["dish_name"]
    # Snapshots survive dish rename
    renamed = client.patch(
        f"/api/dishes/{seeded_events.dishes[0]}",
        json={
            "name": "改名后的菜",
            "category": "荤菜",
            "cook_ids": [client.get("/api/session").json()["member"]["id"]],
            "ingredients": ["番茄", "鸡蛋"],
        },
    )
    assert renamed.status_code == 200
    after = client.get("/api/history?from=2026-08-01&to=2026-08-14").json()
    names = {item["dish_name"] for entry in after for item in entry["menu"]}
    assert "番茄炒蛋" in names
    assert "改名后的菜" not in names


def test_validation_checkin_requires_monday(
    client: TestClient, household: dict
) -> None:
    del household
    # 2026-08-04 is Tuesday
    response = client.put(
        "/api/validation-checkins/2026-08-04",
        json={"home_meal_count": 4, "offline_discussion_count": 0},
    )
    assert response.status_code == 422


def test_history_cross_household_isolation(
    app: FastAPI,
    client: TestClient,
    three_confirmed_meals: SimpleNamespace,
) -> None:
    del three_confirmed_meals
    with TestClient(app) as other:
        other_household = _create_household(
            other, household_name="别家", owner_name="外人", pin="2222"
        )
        dish = _create_dish(other, other_household["member"]["id"], "别家菜")
        slot = _get_slot(other, "2026-08-03", "dinner")
        _confirm(other, slot["id"], dish)
        other_history = other.get(
            "/api/history?from=2026-08-01&to=2026-08-14"
        ).json()
        assert len(other_history) == 1
        assert other_history[0]["menu"][0]["dish_name"] == "别家菜"

    own = client.get("/api/history?from=2026-08-01&to=2026-08-14").json()
    assert len(own) == 3
    names = {item["dish_name"] for entry in own for item in entry["menu"]}
    assert "别家菜" not in names
