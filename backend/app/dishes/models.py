from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import CreatedAtMixin, UUIDPrimaryKeyMixin, utc_now
from app.db import Base
from app.households.models import Member

DishCategory = Literal["荤菜", "素菜", "主食", "汤", "其他"]
DISH_CATEGORIES = ("荤菜", "素菜", "主食", "汤", "其他")


class Dish(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "dishes"

    household_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[DishCategory] = mapped_column(String(16), nullable=False)
    image_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    updated_by_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    cooks: Mapped[list["DishCook"]] = relationship(
        back_populates="dish", cascade="all, delete-orphan"
    )
    ingredients: Mapped[list["DishIngredient"]] = relationship(
        back_populates="dish", cascade="all, delete-orphan"
    )
    created_by: Mapped[Member] = relationship(foreign_keys=[created_by_id])
    updated_by: Mapped[Member] = relationship(foreign_keys=[updated_by_id])

    __table_args__ = (
        CheckConstraint(
            "category IN ('荤菜', '素菜', '主食', '汤', '其他')",
            name="ck_dishes_category",
        ),
    )


class DishCook(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "dish_cooks"

    dish_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("dishes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    member_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    dish: Mapped[Dish] = relationship(back_populates="cooks")
    member: Mapped[Member] = relationship()

    __table_args__ = (
        UniqueConstraint("dish_id", "member_id", name="uq_dish_cooks_dish_member"),
    )


class Ingredient(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "ingredients"

    household_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="RESTRICT"),
        nullable=False,
    )

    aliases: Mapped[list["IngredientAlias"]] = relationship(
        back_populates="ingredient", cascade="all, delete-orphan"
    )
    created_by: Mapped[Member] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "household_id",
            "normalized_name",
            name="uq_ingredients_household_normalized_name",
        ),
    )


class IngredientAlias(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "ingredient_aliases"

    household_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ingredient_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ingredients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="RESTRICT"),
        nullable=False,
    )

    ingredient: Mapped[Ingredient] = relationship(back_populates="aliases")

    __table_args__ = (
        UniqueConstraint(
            "household_id",
            "normalized_name",
            name="uq_ingredient_aliases_household_normalized_name",
        ),
    )


class DishIngredient(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "dish_ingredients"

    dish_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("dishes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ingredient_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ingredients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    dish: Mapped[Dish] = relationship(back_populates="ingredients")
    ingredient: Mapped[Ingredient] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "dish_id",
            "ingredient_id",
            name="uq_dish_ingredients_dish_ingredient",
        ),
    )
