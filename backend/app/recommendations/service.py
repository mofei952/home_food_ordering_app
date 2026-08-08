from __future__ import annotations

import random
from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dishes.models import Dish, DishCook, DishIngredient
from app.dishes.schemas import CookSummary, IngredientSummary
from app.errors import ApiError
from app.households.service import AuthContext
from app.meals.models import MealSlot, MenuItem
from app.meals.service import household_local_date
from app.recommendations.domain import (
    CandidateDish,
    NoCandidatesError,
    choose_weighted,
    match_ingredients,
    recency_weight,
)
from app.recommendations.schemas import (
    RandomRequest,
    RandomResponse,
    RecommendationFilters,
    RecommendedDishRead,
    SearchResponse,
)

FILTER_LABELS = {
    "cook_ids": "制作者",
    "categories": "类别",
    "available_ingredient_ids": "食材",
}


def relaxable_filter_keys(filters: RecommendationFilters) -> list[str]:
    keys: list[str] = []
    if filters.cook_ids:
        keys.append("cook_ids")
    if filters.categories:
        keys.append("categories")
    if filters.available_ingredient_ids:
        keys.append("available_ingredient_ids")
    return keys


def no_candidates_error(filters: RecommendationFilters) -> ApiError:
    keys = relaxable_filter_keys(filters)
    if not keys:
        detail = "菜品库为空，请先录入菜品"
    else:
        labels = "、".join(FILTER_LABELS[key] for key in keys)
        detail = f"没有符合条件的菜品，可尝试放宽：{labels}"
    return ApiError(
        404,
        detail,
        "no_candidates",
        relaxable_filters=keys,
    )


async def load_last_eaten_dates(
    db: AsyncSession, household_id: UUID
) -> dict[UUID, date]:
    rows = await db.execute(
        select(MenuItem.dish_id, func.max(MealSlot.local_date))
        .join(MealSlot, MenuItem.meal_slot_id == MealSlot.id)
        .where(
            MealSlot.household_id == household_id,
            MealSlot.status == "confirmed",
        )
        .group_by(MenuItem.dish_id)
    )
    return {dish_id: local_date for dish_id, local_date in rows.all()}


async def load_candidate_dishes(
    db: AsyncSession,
    auth: AuthContext,
    filters: RecommendationFilters,
) -> list[Dish]:
    statement = (
        select(Dish)
        .where(Dish.household_id == auth.household.id, Dish.archived_at.is_(None))
        .options(
            selectinload(Dish.cooks).selectinload(DishCook.member),
            selectinload(Dish.ingredients).selectinload(DishIngredient.ingredient),
        )
    )
    if filters.categories:
        statement = statement.where(Dish.category.in_(list(filters.categories)))
    if filters.cook_ids:
        statement = (
            statement.join(DishCook)
            .where(DishCook.member_id.in_(list(filters.cook_ids)))
            .distinct()
        )
    dishes = list(await db.scalars(statement))
    return sorted(dishes, key=lambda dish: dish.name)


def to_recommended_dish(
    dish: Dish,
    *,
    missing_ids: frozenset[str],
    visibility: str,
    last_eaten_on: date | None,
    weight: Decimal,
) -> RecommendedDishRead:
    cooks = [
        CookSummary.model_validate(link.member)
        for link in sorted(dish.cooks, key=lambda item: item.member.nickname)
    ]
    ingredients = [
        IngredientSummary.model_validate(link.ingredient)
        for link in sorted(
            dish.ingredients, key=lambda item: item.ingredient.name
        )
    ]
    missing_ingredients = [
        item for item in ingredients if str(item.id) in missing_ids
    ]
    return RecommendedDishRead(
        id=dish.id,
        name=dish.name,
        category=dish.category,
        cooks=cooks,
        ingredients=ingredients,
        missing_ingredients=missing_ingredients,
        visibility=visibility,  # type: ignore[arg-type]
        last_eaten_on=last_eaten_on,
        weight=weight,
    )


def build_matched_dishes(
    dishes: Sequence[Dish],
    *,
    available_ids: frozenset[str],
    apply_ingredient_filter: bool,
    last_eaten: dict[UUID, date],
    today: date,
) -> tuple[list[RecommendedDishRead], list[RecommendedDishRead]]:
    ready: list[RecommendedDishRead] = []
    one_missing: list[RecommendedDishRead] = []

    for dish in dishes:
        required = frozenset(
            str(link.ingredient_id) for link in dish.ingredients
        )
        if apply_ingredient_filter:
            match = match_ingredients(required, available_ids)
            if match.visibility == "hidden":
                continue
            visibility = match.visibility
            missing = match.missing
        else:
            visibility = "ready"
            missing = frozenset()

        last = last_eaten.get(dish.id)
        weight = recency_weight(last, today)
        item = to_recommended_dish(
            dish,
            missing_ids=missing,
            visibility=visibility,
            last_eaten_on=last,
            weight=weight,
        )
        if visibility == "ready":
            ready.append(item)
        else:
            one_missing.append(item)

    return ready, one_missing


async def search_recommendations(
    db: AsyncSession,
    auth: AuthContext,
    filters: RecommendationFilters,
) -> SearchResponse:
    dishes = await load_candidate_dishes(db, auth, filters)
    last_eaten = await load_last_eaten_dates(db, auth.household.id)
    today = household_local_date(auth.household)
    available = frozenset(str(item) for item in filters.available_ingredient_ids)
    apply_filter = bool(filters.available_ingredient_ids)
    ready, one_missing = build_matched_dishes(
        dishes,
        available_ids=available,
        apply_ingredient_filter=apply_filter,
        last_eaten=last_eaten,
        today=today,
    )
    if not ready and not one_missing:
        raise no_candidates_error(filters)
    return SearchResponse(
        ready=ready,
        one_missing=one_missing,
        meal_slot_id=filters.meal_slot_id,
    )


async def random_recommendation(
    db: AsyncSession,
    auth: AuthContext,
    payload: RandomRequest,
) -> RandomResponse:
    filters = RecommendationFilters(
        cook_ids=payload.cook_ids,
        categories=payload.categories,
        available_ingredient_ids=payload.available_ingredient_ids,
        meal_slot_id=payload.meal_slot_id,
    )
    dishes = await load_candidate_dishes(db, auth, filters)
    last_eaten = await load_last_eaten_dates(db, auth.household.id)
    today = household_local_date(auth.household)
    available = frozenset(str(item) for item in filters.available_ingredient_ids)
    apply_filter = bool(filters.available_ingredient_ids)
    ready, one_missing = build_matched_dishes(
        dishes,
        available_ids=available,
        apply_ingredient_filter=apply_filter,
        last_eaten=last_eaten,
        today=today,
    )
    matched = ready + one_missing
    if not matched:
        raise no_candidates_error(filters)

    candidates = [
        CandidateDish(id=str(item.id), weight=item.weight) for item in matched
    ]
    rng = random.Random(payload.seed)
    try:
        chosen = choose_weighted(candidates, rng)
    except NoCandidatesError as error:
        raise no_candidates_error(filters) from error

    dish = next(item for item in matched if str(item.id) == chosen.id)
    return RandomResponse(dish=dish, meal_slot_id=payload.meal_slot_id)
