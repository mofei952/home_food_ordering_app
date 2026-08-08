from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.households.service import AuthContext, require_member
from app.meals.schemas import MealSlotRead, MenuUpdate
from app.meals.service import (
    delete_own_request,
    get_or_create_meal_slot,
    replace_menu,
    slot_to_read,
    upsert_request,
)

router = APIRouter(prefix="/api")
DbSession = Annotated[AsyncSession, Depends(get_session)]
CurrentMember = Annotated[AuthContext, Depends(require_member)]


@router.get("/meal-slots/{local_date}/{meal_type}", response_model=MealSlotRead)
async def get_meal_slot(
    local_date: date,
    meal_type: str,
    auth: CurrentMember,
    db: DbSession,
) -> MealSlotRead:
    slot = await get_or_create_meal_slot(db, auth, local_date, meal_type)
    return await slot_to_read(db, slot)


@router.put(
    "/meal-slots/{slot_id}/requests/{dish_id}",
    response_model=MealSlotRead,
)
async def put_meal_request(
    slot_id: UUID,
    dish_id: UUID,
    auth: CurrentMember,
    db: DbSession,
) -> MealSlotRead:
    slot = await upsert_request(db, auth, slot_id, dish_id)
    return await slot_to_read(db, slot)


@router.delete(
    "/meal-slots/{slot_id}/requests/{dish_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_meal_request(
    slot_id: UUID,
    dish_id: UUID,
    auth: CurrentMember,
    db: DbSession,
) -> Response:
    await delete_own_request(db, auth, slot_id, dish_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/meal-slots/{slot_id}/menu", response_model=MealSlotRead)
async def put_meal_menu(
    slot_id: UUID,
    payload: MenuUpdate,
    auth: CurrentMember,
    db: DbSession,
) -> MealSlotRead:
    slot = await replace_menu(db, auth, slot_id, payload)
    return await slot_to_read(db, slot)
