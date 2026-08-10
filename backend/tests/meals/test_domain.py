"""Pure unit tests for meal mapping helpers (no DB)."""

from datetime import date, datetime
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.meals.service import household_local_date, meal_slot_to_read


def test_household_local_date_respects_timezone() -> None:
    household = SimpleNamespace(timezone="Asia/Shanghai")
    # 2026-08-10 23:30 UTC → 2026-08-11 07:30 in Shanghai
    moment = datetime(2026, 8, 10, 23, 30, tzinfo=ZoneInfo("UTC"))
    assert household_local_date(household, moment) == date(2026, 8, 11)


def test_meal_slot_to_read_missing_dish_and_nickname_sort() -> None:
    dish_id = uuid4()
    member_b = SimpleNamespace(id=uuid4(), nickname="小贝")
    member_a = SimpleNamespace(id=uuid4(), nickname="阿明")
    slot = SimpleNamespace(
        id=uuid4(),
        local_date=date(2026, 8, 10),
        meal_type="lunch",
        status="pending",
        version=1,
        requests=[
            SimpleNamespace(dish_id=dish_id, member=member_b),
            SimpleNamespace(dish_id=dish_id, member=member_a),
        ],
        menu_items=[],
        last_modified_by=None,
        last_modified_at=None,
    )

    read = meal_slot_to_read(slot, dishes_by_id={})

    assert len(read.requests) == 1
    assert read.requests[0].dish_id == dish_id
    assert read.requests[0].dish_name == ""
    assert read.requests[0].image_key is None
    assert [m.nickname for m in read.requests[0].requested_by] == ["小贝", "阿明"]
