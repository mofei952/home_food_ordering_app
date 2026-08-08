from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EventName = Literal[
    "meal_opened",
    "first_request_added",
    "menu_confirmed",
    "menu_modified",
]
DecisionSource = Literal["direct", "random", "ingredient"]
MealType = Literal["lunch", "dinner"]

ALLOWED_EVENT_NAMES: frozenset[str] = frozenset(
    {
        "meal_opened",
        "first_request_added",
        "menu_confirmed",
        "menu_modified",
    }
)
ALLOWED_PROPERTY_KEYS: frozenset[str] = frozenset(
    {
        "meal_slot_id",
        "decision_source",
        "request_count",
        "participant_count",
    }
)
ALLOWED_DECISION_SOURCES: frozenset[str] = frozenset(
    {"direct", "random", "ingredient"}
)


class EventCreate(BaseModel):
    name: EventName
    properties: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_properties(self) -> "EventCreate":
        unknown = set(self.properties) - ALLOWED_PROPERTY_KEYS
        if unknown:
            raise ValueError("事件属性不在白名单内")
        source = self.properties.get("decision_source")
        if source is not None and source not in ALLOWED_DECISION_SOURCES:
            raise ValueError("决定来源无效")
        for key in ("request_count", "participant_count"):
            value = self.properties.get(key)
            if value is not None and (
                not isinstance(value, int) or isinstance(value, bool) or value < 0
            ):
                raise ValueError(f"{key} 必须为非负整数")
        meal_slot_id = self.properties.get("meal_slot_id")
        if meal_slot_id is not None:
            try:
                UUID(str(meal_slot_id))
            except (TypeError, ValueError) as exc:
                raise ValueError("meal_slot_id 格式无效") from exc
        return self


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: EventName
    properties: dict[str, Any]
    created_at: datetime


class ValidationCheckinWrite(BaseModel):
    home_meal_count: int = Field(ge=0)
    offline_discussion_count: int = Field(ge=0)


class ValidationCheckinRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    week_start: date
    home_meal_count: int
    offline_discussion_count: int
    updated_at: datetime


class DecisionSourceCounts(BaseModel):
    direct: int = 0
    random: int = 0
    ingredient: int = 0


class ConfirmationDetail(BaseModel):
    meal_slot_id: UUID
    local_date: date | None = None
    meal_type: MealType | None = None
    request_count: int | None = None
    participant_count: int | None = None
    confirmation_seconds: int | None = None


class MetricsSummary(BaseModel):
    median_confirmation_seconds: int | None
    app_decided_meal_ratio: float | None
    decision_source_counts: DecisionSourceCounts
    menu_modified_count: int
    confirmation_details: list[ConfirmationDetail]
    offline_discussion_count: int | None = None


class HistoryMenuItem(BaseModel):
    dish_id: UUID
    dish_name: str
    image_key: str | None


class HistoryLastModifier(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nickname: str


class HistoryEntry(BaseModel):
    meal_slot_id: UUID
    local_date: date
    meal_type: MealType
    menu: list[HistoryMenuItem]
    last_modified_by: HistoryLastModifier | None
    last_modified_at: datetime | None


class DateRangeQuery(BaseModel):
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")

    @field_validator("to_date")
    @classmethod
    def range_ordered(cls, value: date, info: object) -> date:
        return value

    @model_validator(mode="after")
    def validate_range(self) -> "DateRangeQuery":
        if self.to_date < self.from_date:
            raise ValueError("结束日期不能早于开始日期")
        return self
