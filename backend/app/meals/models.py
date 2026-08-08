from datetime import date, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import CreatedAtMixin, UUIDPrimaryKeyMixin
from app.db import Base
from app.households.models import Member

MealType = Literal["lunch", "dinner"]
MealSlotStatus = Literal["not_started", "pending", "confirmed"]
MEAL_TYPES = ("lunch", "dinner")
MEAL_SLOT_STATUSES = ("not_started", "pending", "confirmed")


class MealSlot(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "meal_slots"

    household_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    meal_type: Mapped[MealType] = mapped_column(String(16), nullable=False)
    status: Mapped[MealSlotStatus] = mapped_column(
        String(32), nullable=False, default="not_started"
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_modified_by_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="RESTRICT"),
        nullable=True,
    )
    last_modified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    requests: Mapped[list["MealRequest"]] = relationship(
        back_populates="meal_slot", cascade="all, delete-orphan"
    )
    menu_items: Mapped[list["MenuItem"]] = relationship(
        back_populates="meal_slot", cascade="all, delete-orphan"
    )
    last_modified_by: Mapped[Member | None] = relationship(
        foreign_keys=[last_modified_by_id]
    )

    __table_args__ = (
        UniqueConstraint(
            "household_id",
            "local_date",
            "meal_type",
            name="uq_meal_slots_household_date_type",
        ),
        CheckConstraint(
            "meal_type IN ('lunch', 'dinner')",
            name="ck_meal_slots_meal_type",
        ),
        CheckConstraint(
            "status IN ('not_started', 'pending', 'confirmed')",
            name="ck_meal_slots_status",
        ),
    )


class MealRequest(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "meal_requests"

    meal_slot_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meal_slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    member_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dish_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("dishes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    meal_slot: Mapped[MealSlot] = relationship(back_populates="requests")
    member: Mapped[Member] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "meal_slot_id",
            "member_id",
            "dish_id",
            name="uq_meal_requests_slot_member_dish",
        ),
    )


class MenuItem(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "menu_items"

    meal_slot_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meal_slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dish_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("dishes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    dish_name_snapshot: Mapped[str] = mapped_column(String(100), nullable=False)
    image_key_snapshot: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    meal_slot: Mapped[MealSlot] = relationship(back_populates="menu_items")

    __table_args__ = (
        UniqueConstraint(
            "meal_slot_id",
            "dish_id",
            name="uq_menu_items_slot_dish",
        ),
    )
