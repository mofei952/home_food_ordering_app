from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MealType = Literal["lunch", "dinner"]
MealSlotStatus = Literal["not_started", "pending", "confirmed"]


class RequestedBySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nickname: str


class MergedMealRequestRead(BaseModel):
    dish_id: UUID
    dish_name: str
    image_key: str | None
    requested_by: list[RequestedBySummary]


class MenuItemRead(BaseModel):
    dish_id: UUID
    dish_name: str
    image_key: str | None


class LastModifierSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nickname: str


class MealSlotRead(BaseModel):
    id: UUID
    local_date: date
    meal_type: MealType
    status: MealSlotStatus
    version: int
    requests: list[MergedMealRequestRead]
    menu: list[MenuItemRead]
    last_modified_by: LastModifierSummary | None
    last_modified_at: datetime | None


class MenuUpdate(BaseModel):
    dish_ids: list[UUID] = Field(default_factory=list)
    expected_version: int = Field(ge=0)
