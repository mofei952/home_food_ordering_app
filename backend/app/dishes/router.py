from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dishes.schemas import (
    DishCreate,
    DishRead,
    DishUpdate,
    IngredientCreate,
    IngredientRead,
)
from app.dishes.service import (
    archive_dish,
    create_canonical_ingredient,
    create_dish,
    dish_to_read,
    ingredient_to_read,
    list_dishes,
    require_dish,
    search_ingredients,
    update_dish,
)
from app.households.service import AuthContext, require_member

router = APIRouter(prefix="/api")
DbSession = Annotated[AsyncSession, Depends(get_session)]
CurrentMember = Annotated[AuthContext, Depends(require_member)]


@router.get("/dishes", response_model=list[DishRead])
async def get_dishes(
    auth: CurrentMember,
    db: DbSession,
    cook_id: UUID | None = None,
    category: str | None = None,
    include_archived: bool = Query(default=False),
) -> list[DishRead]:
    dishes = await list_dishes(
        db,
        auth,
        cook_id=cook_id,
        category=category,
        include_archived=include_archived,
    )
    return [dish_to_read(dish) for dish in dishes]


@router.post(
    "/dishes",
    response_model=DishRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_dish(
    payload: DishCreate,
    auth: CurrentMember,
    db: DbSession,
) -> DishRead:
    dish = await create_dish(db, auth, payload)
    return dish_to_read(dish)


@router.get("/dishes/{dish_id}", response_model=DishRead)
async def get_dish(
    dish_id: UUID,
    auth: CurrentMember,
    db: DbSession,
) -> DishRead:
    dish = await require_dish(db, auth.household.id, dish_id)
    return dish_to_read(dish)


@router.patch("/dishes/{dish_id}", response_model=DishRead)
async def patch_dish(
    dish_id: UUID,
    payload: DishUpdate,
    auth: CurrentMember,
    db: DbSession,
) -> DishRead:
    dish = await update_dish(db, auth, dish_id, payload)
    return dish_to_read(dish)


@router.delete("/dishes/{dish_id}", response_model=DishRead)
async def delete_dish(
    dish_id: UUID,
    auth: CurrentMember,
    db: DbSession,
) -> DishRead:
    dish = await archive_dish(db, auth, dish_id)
    return dish_to_read(dish)


@router.get("/ingredients", response_model=list[IngredientRead])
async def get_ingredients(
    auth: CurrentMember,
    db: DbSession,
    query: str | None = None,
) -> list[IngredientRead]:
    ingredients = await search_ingredients(db, auth, query)
    return [ingredient_to_read(item) for item in ingredients]


@router.post(
    "/ingredients",
    response_model=IngredientRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_ingredient(
    payload: IngredientCreate,
    auth: CurrentMember,
    db: DbSession,
) -> IngredientRead:
    ingredient = await create_canonical_ingredient(db, auth, payload)
    return ingredient_to_read(ingredient)
