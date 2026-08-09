from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.dishes.schemas import CookSummary, IngredientSummary

DishCategory = Literal["荤菜", "素菜", "主食", "汤", "其他"]
Visibility = Literal["ready", "one_missing"]


class RecommendationFilters(BaseModel):
    cook_ids: list[UUID] = Field(default_factory=list)
    categories: list[DishCategory] = Field(default_factory=list)
    available_ingredient_ids: list[UUID] = Field(default_factory=list)
    meal_slot_id: UUID | None = None


class RandomRequest(RecommendationFilters):
    seed: int | None = None


class RecommendedDishRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: DishCategory
    cooks: list[CookSummary]
    ingredients: list[IngredientSummary]
    missing_ingredients: list[IngredientSummary]
    visibility: Visibility
    last_eaten_on: date | None
    weight: Decimal


class SearchResponse(BaseModel):
    ready: list[RecommendedDishRead]
    one_missing: list[RecommendedDishRead]
    meal_slot_id: UUID | None


class RandomResponse(BaseModel):
    dish: RecommendedDishRead
    meal_slot_id: UUID | None
