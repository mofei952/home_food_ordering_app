from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import CreatedAtMixin, UUIDPrimaryKeyMixin
from app.db import Base

MemberRole = Literal["owner", "member"]
MemberStatus = Literal["active", "disabled"]


class Household(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "households"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    invite_code_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    members: Mapped[list["Member"]] = relationship(
        back_populates="household", cascade="all, delete-orphan"
    )


class Member(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "members"

    household_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    pin_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[MemberRole] = mapped_column(String(16), nullable=False)
    status: Mapped[MemberStatus] = mapped_column(
        String(16), nullable=False, default="active"
    )
    household: Mapped[Household] = relationship(back_populates="members")
    sessions: Mapped[list["Session"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    __table_args__ = (
        CheckConstraint("role IN ('owner', 'member')", name="ck_members_role"),
        CheckConstraint("status IN ('active', 'disabled')", name="ck_members_status"),
        Index(
            "uq_members_household_lower_nickname",
            household_id,
            func.lower(nickname),
            unique=True,
        ),
    )


class Session(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "sessions"

    member_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    member: Mapped[Member] = relationship(back_populates="sessions")
