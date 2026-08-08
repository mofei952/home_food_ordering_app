from collections import defaultdict
from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.models import utc_now
from app.dishes.models import Dish
from app.errors import ApiError
from app.households.models import Household
from app.households.service import AuthContext
from app.meals.models import MEAL_TYPES, MealRequest, MealSlot, MenuItem
from app.meals.schemas import (
    LastModifierSummary,
    MealSlotRead,
    MealType,
    MenuItemRead,
    MenuUpdate,
    MergedMealRequestRead,
    RequestedBySummary,
)


def household_local_date(
    household: Household, at: datetime | None = None
) -> date:
    moment = at or utc_now()
    return moment.astimezone(ZoneInfo(household.timezone)).date()


def meal_slot_to_read(
    slot: MealSlot, dishes_by_id: dict[UUID, Dish]
) -> MealSlotRead:
    grouped: dict[UUID, list[RequestedBySummary]] = defaultdict(list)
    for request in slot.requests:
        grouped[request.dish_id].append(
            RequestedBySummary.model_validate(request.member)
        )

    merged_requests: list[MergedMealRequestRead] = []
    for dish_id, requesters in grouped.items():
        dish = dishes_by_id.get(dish_id)
        requesters_sorted = sorted(requesters, key=lambda item: item.nickname)
        merged_requests.append(
            MergedMealRequestRead(
                dish_id=dish_id,
                dish_name=dish.name if dish else "",
                image_key=dish.image_key if dish else None,
                requested_by=requesters_sorted,
            )
        )
    merged_requests.sort(key=lambda item: item.dish_name)

    menu = [
        MenuItemRead(
            dish_id=item.dish_id,
            dish_name=item.dish_name_snapshot,
            image_key=item.image_key_snapshot,
        )
        for item in sorted(slot.menu_items, key=lambda item: item.dish_name_snapshot)
    ]

    last_modified_by = (
        LastModifierSummary.model_validate(slot.last_modified_by)
        if slot.last_modified_by is not None
        else None
    )

    return MealSlotRead(
        id=slot.id,
        local_date=slot.local_date,
        meal_type=slot.meal_type,
        status=slot.status,
        version=slot.version,
        requests=merged_requests,
        menu=menu,
        last_modified_by=last_modified_by,
        last_modified_at=slot.last_modified_at,
    )


async def _load_slot(
    db: AsyncSession, household_id: UUID, slot_id: UUID
) -> MealSlot | None:
    return await db.scalar(
        select(MealSlot)
        .where(MealSlot.id == slot_id, MealSlot.household_id == household_id)
        .options(
            selectinload(MealSlot.requests).selectinload(MealRequest.member),
            selectinload(MealSlot.menu_items),
            selectinload(MealSlot.last_modified_by),
        )
        .execution_options(populate_existing=True)
    )


async def require_slot(
    db: AsyncSession, household_id: UUID, slot_id: UUID
) -> MealSlot:
    slot = await _load_slot(db, household_id, slot_id)
    if slot is None:
        raise ApiError(404, "餐次不存在", "meal_slot_not_found")
    return slot


async def _dishes_for_slot(db: AsyncSession, slot: MealSlot) -> dict[UUID, Dish]:
    dish_ids = {request.dish_id for request in slot.requests}
    dish_ids.update(item.dish_id for item in slot.menu_items)
    if not dish_ids:
        return {}
    rows = await db.scalars(select(Dish).where(Dish.id.in_(dish_ids)))
    return {dish.id: dish for dish in rows}


async def slot_to_read(db: AsyncSession, slot: MealSlot) -> MealSlotRead:
    dishes = await _dishes_for_slot(db, slot)
    return meal_slot_to_read(slot, dishes)


def _parse_meal_type(meal_type: str) -> MealType:
    if meal_type not in MEAL_TYPES:
        raise ApiError(422, "餐次类型无效", "invalid_meal_type")
    return meal_type  # type: ignore[return-value]


async def get_or_create_meal_slot(
    db: AsyncSession,
    auth: AuthContext,
    local_date: date,
    meal_type: str,
) -> MealSlot:
    parsed_type = _parse_meal_type(meal_type)
    existing = await db.scalar(
        select(MealSlot).where(
            MealSlot.household_id == auth.household.id,
            MealSlot.local_date == local_date,
            MealSlot.meal_type == parsed_type,
        )
    )
    if existing is not None:
        loaded = await require_slot(db, auth.household.id, existing.id)
        return loaded

    slot = MealSlot(
        household_id=auth.household.id,
        local_date=local_date,
        meal_type=parsed_type,
        status="not_started",
        version=0,
    )
    db.add(slot)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(
            select(MealSlot).where(
                MealSlot.household_id == auth.household.id,
                MealSlot.local_date == local_date,
                MealSlot.meal_type == parsed_type,
            )
        )
        if existing is None:
            raise
        return await require_slot(db, auth.household.id, existing.id)

    return await require_slot(db, auth.household.id, slot.id)


async def _require_active_dish(
    db: AsyncSession,
    household_id: UUID,
    dish_id: UUID,
    *,
    archived_detail: str,
) -> Dish:
    dish = await db.scalar(
        select(Dish).where(Dish.id == dish_id, Dish.household_id == household_id)
    )
    if dish is None:
        raise ApiError(404, "菜品不存在", "dish_not_found")
    if dish.archived_at is not None:
        raise ApiError(422, archived_detail, "dish_archived")
    return dish


async def upsert_request(
    db: AsyncSession, auth: AuthContext, slot_id: UUID, dish_id: UUID
) -> MealSlot:
    slot = await require_slot(db, auth.household.id, slot_id)
    await _require_active_dish(
        db,
        auth.household.id,
        dish_id,
        archived_detail="已归档菜品不能点选",
    )

    existing = await db.scalar(
        select(MealRequest).where(
            MealRequest.meal_slot_id == slot.id,
            MealRequest.member_id == auth.member.id,
            MealRequest.dish_id == dish_id,
        )
    )
    if existing is None:
        prior_any = await db.scalar(
            select(MealRequest.id)
            .where(MealRequest.meal_slot_id == slot.id)
            .limit(1)
        )
        is_first_request = prior_any is None
        db.add(
            MealRequest(
                meal_slot_id=slot.id,
                member_id=auth.member.id,
                dish_id=dish_id,
            )
        )
        if slot.status == "not_started":
            slot.status = "pending"
        if is_first_request:
            from app.metrics.service import record_first_request_added

            await record_first_request_added(db, auth, slot)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            slot = await require_slot(db, auth.household.id, slot_id)
            if slot.status == "not_started":
                slot.status = "pending"
                await db.commit()

    return await require_slot(db, auth.household.id, slot_id)


async def delete_own_request(
    db: AsyncSession, auth: AuthContext, slot_id: UUID, dish_id: UUID
) -> None:
    slot = await require_slot(db, auth.household.id, slot_id)
    existing = await db.scalar(
        select(MealRequest).where(
            MealRequest.meal_slot_id == slot.id,
            MealRequest.member_id == auth.member.id,
            MealRequest.dish_id == dish_id,
        )
    )
    if existing is not None:
        await db.delete(existing)
        await db.flush()
        remaining = await db.scalar(
            select(MealRequest.id).where(MealRequest.meal_slot_id == slot.id).limit(1)
        )
        if remaining is None and slot.status == "pending":
            slot.status = "not_started"
        await db.commit()


async def replace_menu(
    db: AsyncSession, auth: AuthContext, slot_id: UUID, payload: MenuUpdate
) -> MealSlot:
    slot = await require_slot(db, auth.household.id, slot_id)
    was_confirmed = slot.status == "confirmed"

    dishes: list[Dish] = []
    seen: set[UUID] = set()
    for dish_id in payload.dish_ids:
        if dish_id in seen:
            continue
        seen.add(dish_id)
        dishes.append(
            await _require_active_dish(
                db,
                auth.household.id,
                dish_id,
                archived_detail="已归档菜品不能加入菜单",
            )
        )

    # Claim the version atomically so concurrent writers with the same
    # expected_version cannot both commit.
    result = await db.execute(
        update(MealSlot)
        .where(
            MealSlot.id == slot.id,
            MealSlot.household_id == auth.household.id,
            MealSlot.version == payload.expected_version,
        )
        .values(
            version=payload.expected_version + 1,
            status="confirmed",
            last_modified_by_id=auth.member.id,
            last_modified_at=utc_now(),
        )
    )
    rowcount = getattr(result, "rowcount", 0)
    if rowcount == 0:
        current_version = await db.scalar(
            select(MealSlot.version).where(
                MealSlot.id == slot.id,
                MealSlot.household_id == auth.household.id,
            )
        )
        raise ApiError(
            409,
            "菜单已被其他成员更新",
            "version_conflict",
            current_version=current_version if current_version is not None else slot.version,
        )

    await db.execute(delete(MenuItem).where(MenuItem.meal_slot_id == slot.id))
    for dish in dishes:
        db.add(
            MenuItem(
                meal_slot_id=slot.id,
                dish_id=dish.id,
                dish_name_snapshot=dish.name,
                image_key_snapshot=dish.image_key,
            )
        )

    from app.metrics.service import record_menu_lifecycle_event

    await record_menu_lifecycle_event(
        db, auth, slot, was_confirmed=was_confirmed
    )

    await db.commit()
    return await require_slot(db, auth.household.id, slot_id)
