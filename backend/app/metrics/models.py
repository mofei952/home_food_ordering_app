from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.common.models import CreatedAtMixin, UUIDPrimaryKeyMixin, utc_now
from app.db import Base


class ActivityEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "activity_events"

    household_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    member_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    properties: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )


class ValidationCheckin(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "validation_checkins"

    household_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    home_meal_count: Mapped[int] = mapped_column(Integer, nullable=False)
    offline_discussion_count: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "household_id",
            "week_start",
            name="uq_validation_checkins_household_week",
        ),
    )
