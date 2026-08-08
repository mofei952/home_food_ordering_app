from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.errors import ApiError
from app.households.models import Household, Member
from app.households.service import AuthContext
from app.meals.models import MealSlot
from app.meals.schemas import MenuUpdate
from app.meals.service import replace_menu


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
    assert stale.json() == {
        "detail": stale.json()["detail"],
        "code": "version_conflict",
        "current_version": 1,
    }

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


def test_replace_menu_update_sql_includes_expected_version(
    client: TestClient,
    test_engine: AsyncEngine,
    slot: SimpleNamespace,
    dish: SimpleNamespace,
) -> None:
    """Prove the version claim uses UPDATE … WHERE version = :expected."""
    statements: list[str] = []

    def capture_statement(
        _connection: Any,
        _cursor: Any,
        statement: str,
        _parameters: Any,
        _context: Any,
        _executemany: bool,
    ) -> None:
        statements.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", capture_statement)
    try:
        response = client.put(
            f"/api/meal-slots/{slot.id}/menu",
            json={"dish_ids": [str(dish.id)], "expected_version": 0},
        )
    finally:
        event.remove(
            test_engine.sync_engine,
            "before_cursor_execute",
            capture_statement,
        )

    assert response.status_code == 200
    normalized = [" ".join(stmt.lower().split()) for stmt in statements]
    assert any(
        stmt.startswith("update meal_slots")
        and "meal_slots.version =" in stmt
        and "meal_slots.id =" in stmt
        and "meal_slots.household_id =" in stmt
        for stmt in normalized
    )


def test_second_writer_conflicts_via_conditional_update_rowcount(
    client: TestClient,
    test_engine: AsyncEngine,
    household: dict,
    slot: SimpleNamespace,
    dish: SimpleNamespace,
) -> None:
    """
    Both writers observe expected_version=0 before either writes.

    The second writer's conditional UPDATE matches 0 rows and raises 409,
    even though its in-memory read still saw version 0.
    """
    import asyncio

    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

    async def run() -> None:
        async with session_factory() as reader:
            loaded = await reader.scalar(
                select(MealSlot).where(MealSlot.id == slot.id)
            )
            assert loaded is not None
            assert loaded.version == 0
            observed_version = loaded.version

        # Concurrent writer commits version=1 before the "stale" writer updates.
        async with session_factory() as winner:
            await winner.execute(
                update(MealSlot)
                .where(MealSlot.id == slot.id, MealSlot.version == 0)
                .values(version=1, status="confirmed")
            )
            await winner.commit()

        async with session_factory() as stale_db:
            member = await stale_db.scalar(
                select(Member).where(Member.id == UUID(household["member"]["id"]))
            )
            hh = await stale_db.scalar(
                select(Household).where(
                    Household.id == UUID(household["household"]["id"])
                )
            )
            assert member is not None and hh is not None
            auth = AuthContext(member=member, household=hh)
            with pytest.raises(ApiError) as exc_info:
                await replace_menu(
                    stale_db,
                    auth,
                    slot.id,
                    MenuUpdate(dish_ids=[dish.id], expected_version=observed_version),
                )
            error = exc_info.value
            assert error.status_code == 409
            assert error.code == "version_conflict"
            assert error.current_version == 1

    asyncio.run(run())
