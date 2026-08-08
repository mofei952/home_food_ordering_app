from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

DishCategory = Literal["荤菜", "素菜", "主食", "汤", "其他"]
NonEmptyName = Annotated[str, Field(min_length=1, max_length=100)]


class CookSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nickname: str


class IngredientSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class UpdatedBySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nickname: str


class DishWrite(BaseModel):
    name: NonEmptyName
    category: DishCategory
    cook_ids: list[UUID] = Field(min_length=1)
    ingredients: list[NonEmptyName] = Field(min_length=1)
    image_key: str | None = None

    @field_validator("name")
    @classmethod
    def non_blank_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("菜名不能为空")
        return value

    @field_validator("ingredients")
    @classmethod
    def non_blank_ingredients(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for value in values:
            item = value.strip()
            if not item:
                raise ValueError("食材不能为空")
            cleaned.append(item)
        if not cleaned:
            raise ValueError("至少需要一种食材")
        return cleaned

    @field_validator("cook_ids")
    @classmethod
    def unique_cooks(cls, values: list[UUID]) -> list[UUID]:
        if len(set(values)) != len(values):
            raise ValueError("制作者不能重复")
        return values


class DishCreate(DishWrite):
    pass


class DishUpdate(DishWrite):
    pass


class DishRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: DishCategory
    cooks: list[CookSummary]
    ingredients: list[IngredientSummary]
    image_url: str | None
    archived_at: datetime | None
    updated_by: UpdatedBySummary
    updated_at: datetime


class IngredientCreate(BaseModel):
    name: NonEmptyName
    aliases: list[NonEmptyName] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def non_blank_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("食材名称不能为空")
        return value

    @field_validator("aliases")
    @classmethod
    def clean_aliases(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for value in values:
            item = value.strip()
            if not item:
                raise ValueError("同义词不能为空")
            cleaned.append(item)
        return cleaned


class IngredientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    aliases: list[str]
