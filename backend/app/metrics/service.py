from __future__ import annotations

from datetime import date, datetime, time, timedelta
from statistics import median
from typing import Any
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common import models as common_models
from app.errors import ApiError
from app.households.service import AuthContext
from app.meals.models import MealSlot
from app.metrics.models import ActivityEvent, ValidationCheckin
from app.metrics.schemas import (
    ALLOWED_PROPERTY_KEYS,
    ConfirmationDetail,
    DecisionSourceCounts,
    EventCreate,
    EventRead,
    HistoryEntry,
    HistoryLastModifier,
    HistoryMenuItem,
    MetricsSummary,
    ValidationCheckinRead,
    ValidationCheckinWrite,
)


def _as_uuid(value: Any) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=common_models.utc_now().tzinfo)


def _day_end_exclusive(day: date) -> datetime:
    return datetime.combine(
        day + timedelta(days=1), time.min, tzinfo=common_models.utc_now().tzinfo
    )


def require_monday(week_start: date) -> None:
    if week_start.weekday() != 0:
        raise ApiError(422, "周起始日必须是周一", "week_start_not_monday")


def sanitize_properties(properties: dict[str, Any]) -> dict[str, Any]:
    unknown = set(properties) - ALLOWED_PROPERTY_KEYS
    if unknown:
        raise ApiError(422, "事件属性不在白名单内", "event_property_not_allowed")
    cleaned: dict[str, Any] = {}
    for key, value in properties.items():
        if key == "meal_slot_id":
            slot_id = _as_uuid(value)
            if slot_id is None:
                raise ApiError(422, "meal_slot_id 格式无效", "invalid_meal_slot_id")
            cleaned[key] = str(slot_id)
        else:
            cleaned[key] = value
    return cleaned


async def record_event(
    db: AsyncSession,
    auth: AuthContext,
    payload: EventCreate,
    *,
    commit: bool = True,
) -> ActivityEvent:
    event = ActivityEvent(
        household_id=auth.household.id,
        member_id=auth.member.id,
        name=payload.name,
        properties=sanitize_properties(payload.properties),
        created_at=common_models.utc_now(),
    )
    db.add(event)
    if commit:
        await db.commit()
        await db.refresh(event)
    else:
        await db.flush()
    return event


async def record_menu_lifecycle_event(
    db: AsyncSession,
    auth: AuthContext,
    slot: MealSlot,
    *,
    was_confirmed: bool,
) -> None:
    """Server-side auto event for confirm / post-confirm modify."""
    participant_ids = {request.member_id for request in slot.requests}
    properties: dict[str, Any] = {
        "meal_slot_id": str(slot.id),
        "request_count": len(slot.requests),
        "participant_count": len(participant_ids),
    }
    name = "menu_modified" if was_confirmed else "menu_confirmed"
    db.add(
        ActivityEvent(
            household_id=auth.household.id,
            member_id=auth.member.id,
            name=name,
            properties=properties,
            created_at=common_models.utc_now(),
        )
    )


async def upsert_validation_checkin(
    db: AsyncSession,
    auth: AuthContext,
    week_start: date,
    payload: ValidationCheckinWrite,
) -> ValidationCheckin:
    require_monday(week_start)
    existing = await db.scalar(
        select(ValidationCheckin).where(
            ValidationCheckin.household_id == auth.household.id,
            ValidationCheckin.week_start == week_start,
        )
    )
    now = common_models.utc_now()
    if existing is None:
        existing = ValidationCheckin(
            household_id=auth.household.id,
            week_start=week_start,
            home_meal_count=payload.home_meal_count,
            offline_discussion_count=payload.offline_discussion_count,
            updated_at=now,
        )
        db.add(existing)
    else:
        existing.home_meal_count = payload.home_meal_count
        existing.offline_discussion_count = payload.offline_discussion_count
        existing.updated_at = now
    await db.commit()
    await db.refresh(existing)
    return existing


def _events_in_range(
    household_id: UUID, from_date: date, to_date: date
) -> Select[tuple[ActivityEvent]]:
    return select(ActivityEvent).where(
        ActivityEvent.household_id == household_id,
        ActivityEvent.created_at >= _day_start(from_date),
        ActivityEvent.created_at < _day_end_exclusive(to_date),
    )


async def summarize_metrics(
    db: AsyncSession,
    auth: AuthContext,
    from_date: date,
    to_date: date,
) -> MetricsSummary:
    if to_date < from_date:
        raise ApiError(422, "结束日期不能早于开始日期", "invalid_date_range")

    events = list(
        (
            await db.scalars(
                _events_in_range(auth.household.id, from_date, to_date).order_by(
                    ActivityEvent.created_at.asc()
                )
            )
        ).all()
    )

    opened_at: dict[UUID, datetime] = {}
    confirmed_at: dict[UUID, datetime] = {}
    confirmed_props: dict[UUID, dict[str, Any]] = {}
    source_counts = DecisionSourceCounts()
    menu_modified_count = 0

    for event in events:
        props = event.properties or {}
        slot_id = _as_uuid(props.get("meal_slot_id"))
        if event.name == "meal_opened" and slot_id is not None:
            opened_at.setdefault(slot_id, event.created_at)
            source = props.get("decision_source")
            if source == "direct":
                source_counts.direct += 1
            elif source == "random":
                source_counts.random += 1
            elif source == "ingredient":
                source_counts.ingredient += 1
        elif event.name == "menu_confirmed" and slot_id is not None:
            confirmed_at[slot_id] = event.created_at
            confirmed_props[slot_id] = props
        elif event.name == "menu_modified":
            menu_modified_count += 1

    durations: list[int] = []
    details: list[ConfirmationDetail] = []
    slot_ids = set(confirmed_at) | set(opened_at)
    slots_by_id: dict[UUID, MealSlot] = {}
    if slot_ids:
        rows = await db.scalars(
            select(MealSlot).where(
                MealSlot.household_id == auth.household.id,
                MealSlot.id.in_(slot_ids),
            )
        )
        slots_by_id = {slot.id: slot for slot in rows}

    for slot_id, confirmed_time in confirmed_at.items():
        opened_time = opened_at.get(slot_id)
        seconds: int | None = None
        if opened_time is not None:
            seconds = int((confirmed_time - opened_time).total_seconds())
            if seconds >= 0:
                durations.append(seconds)
        props = confirmed_props.get(slot_id, {})
        slot = slots_by_id.get(slot_id)
        details.append(
            ConfirmationDetail(
                meal_slot_id=slot_id,
                local_date=slot.local_date if slot else None,
                meal_type=slot.meal_type if slot else None,
                request_count=props.get("request_count"),
                participant_count=props.get("participant_count"),
                confirmation_seconds=seconds,
            )
        )
    details.sort(
        key=lambda item: (
            item.local_date or date.min,
            item.meal_type or "",
        ),
        reverse=True,
    )

    confirmed_count = await db.scalar(
        select(func.count())
        .select_from(MealSlot)
        .where(
            MealSlot.household_id == auth.household.id,
            MealSlot.status == "confirmed",
            MealSlot.local_date >= from_date,
            MealSlot.local_date <= to_date,
        )
    )
    confirmed_count = int(confirmed_count or 0)

    checkins = list(
        (
            await db.scalars(
                select(ValidationCheckin).where(
                    ValidationCheckin.household_id == auth.household.id,
                    ValidationCheckin.week_start >= from_date,
                    ValidationCheckin.week_start <= to_date,
                )
            )
        ).all()
    )
    home_meal_total = sum(item.home_meal_count for item in checkins)
    offline_total = (
        sum(item.offline_discussion_count for item in checkins) if checkins else None
    )

    ratio: float | None = None
    if checkins and home_meal_total > 0:
        ratio = confirmed_count / home_meal_total
    elif checkins and home_meal_total == 0:
        ratio = None

    return MetricsSummary(
        median_confirmation_seconds=int(median(durations)) if durations else None,
        app_decided_meal_ratio=ratio,
        decision_source_counts=source_counts,
        menu_modified_count=menu_modified_count,
        confirmation_details=details,
        offline_discussion_count=offline_total,
    )


async def list_history(
    db: AsyncSession,
    auth: AuthContext,
    from_date: date,
    to_date: date,
) -> list[HistoryEntry]:
    if to_date < from_date:
        raise ApiError(422, "结束日期不能早于开始日期", "invalid_date_range")

    slots = list(
        (
            await db.scalars(
                select(MealSlot)
                .where(
                    MealSlot.household_id == auth.household.id,
                    MealSlot.status == "confirmed",
                    MealSlot.local_date >= from_date,
                    MealSlot.local_date <= to_date,
                )
                .options(
                    selectinload(MealSlot.menu_items),
                    selectinload(MealSlot.last_modified_by),
                )
                .order_by(MealSlot.local_date.desc(), MealSlot.meal_type.desc())
            )
        ).all()
    )

    entries: list[HistoryEntry] = []
    for slot in slots:
        menu = [
            HistoryMenuItem(
                dish_id=item.dish_id,
                dish_name=item.dish_name_snapshot,
                image_key=item.image_key_snapshot,
            )
            for item in sorted(slot.menu_items, key=lambda row: row.dish_name_snapshot)
        ]
        last_modified_by = (
            HistoryLastModifier.model_validate(slot.last_modified_by)
            if slot.last_modified_by is not None
            else None
        )
        entries.append(
            HistoryEntry(
                meal_slot_id=slot.id,
                local_date=slot.local_date,
                meal_type=slot.meal_type,
                menu=menu,
                last_modified_by=last_modified_by,
                last_modified_at=slot.last_modified_at,
            )
        )
    return entries


def event_to_read(event: ActivityEvent) -> EventRead:
    return EventRead.model_validate(event)


def checkin_to_read(checkin: ValidationCheckin) -> ValidationCheckinRead:
    return ValidationCheckinRead.model_validate(checkin)
