"""Pure unit tests for metrics helpers and event schema edges."""

from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.errors import ApiError
from app.metrics.schemas import EventCreate
from app.metrics.service import require_monday, sanitize_properties


def test_require_monday_accepts_monday() -> None:
    require_monday(date(2026, 8, 3))  # Monday


def test_require_monday_rejects_other_weekdays() -> None:
    with pytest.raises(ApiError) as exc:
        require_monday(date(2026, 8, 4))  # Tuesday
    assert exc.value.code == "week_start_not_monday"


def test_sanitize_properties_rejects_unknown_keys() -> None:
    with pytest.raises(ApiError) as exc:
        sanitize_properties({"foo": 1})
    assert exc.value.code == "event_property_not_allowed"


def test_sanitize_properties_rejects_invalid_meal_slot_id() -> None:
    with pytest.raises(ApiError) as exc:
        sanitize_properties({"meal_slot_id": "not-a-uuid"})
    assert exc.value.code == "invalid_meal_slot_id"


def test_sanitize_properties_normalizes_uuid() -> None:
    slot_id = uuid4()
    cleaned = sanitize_properties({"meal_slot_id": str(slot_id)})
    assert cleaned["meal_slot_id"] == str(slot_id)


@pytest.mark.parametrize(
    "properties",
    [
        {"decision_source": "coin_flip"},
        {"request_count": -1},
        {"request_count": True},
        {"participant_count": 1.5},
        {"meal_slot_id": "bad"},
        {"unknown": 1},
    ],
)
def test_event_create_rejects_invalid_properties(properties: dict) -> None:
    with pytest.raises(ValidationError):
        EventCreate(name="meal_opened", properties=properties)


def test_event_create_accepts_valid_edge_counts() -> None:
    slot_id = str(uuid4())
    event = EventCreate(
        name="meal_opened",
        properties={
            "meal_slot_id": slot_id,
            "decision_source": "direct",
            "request_count": 0,
            "participant_count": 0,
        },
    )
    assert event.properties["request_count"] == 0
