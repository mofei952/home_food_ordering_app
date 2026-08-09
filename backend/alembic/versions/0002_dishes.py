"""Create dishes, cooks, ingredients, and aliases.

Revision ID: 0002_dishes
Revises: 0001_households
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_dishes"
down_revision: str | None = "0001_households"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ingredients",
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.String(length=100), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["members.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "household_id",
            "normalized_name",
            name="uq_ingredients_household_normalized_name",
        ),
    )
    op.create_index(
        "ix_ingredients_household_id", "ingredients", ["household_id"]
    )

    op.create_table(
        "ingredient_aliases",
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("ingredient_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.String(length=100), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["members.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["ingredient_id"], ["ingredients.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "household_id",
            "normalized_name",
            name="uq_ingredient_aliases_household_normalized_name",
        ),
    )
    op.create_index(
        "ix_ingredient_aliases_household_id",
        "ingredient_aliases",
        ["household_id"],
    )
    op.create_index(
        "ix_ingredient_aliases_ingredient_id",
        "ingredient_aliases",
        ["ingredient_id"],
    )

    op.create_table(
        "dishes",
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("image_key", sa.String(length=255), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "category IN ('荤菜', '素菜', '主食', '汤', '其他')",
            name="ck_dishes_category",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["members.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["members.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dishes_household_id", "dishes", ["household_id"])

    op.create_table(
        "dish_cooks",
        sa.Column("dish_id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["dish_id"], ["dishes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["member_id"], ["members.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "dish_id", "member_id", name="uq_dish_cooks_dish_member"
        ),
    )
    op.create_index("ix_dish_cooks_dish_id", "dish_cooks", ["dish_id"])
    op.create_index("ix_dish_cooks_member_id", "dish_cooks", ["member_id"])

    op.create_table(
        "dish_ingredients",
        sa.Column("dish_id", sa.Uuid(), nullable=False),
        sa.Column("ingredient_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["dish_id"], ["dishes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["ingredient_id"], ["ingredients.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "dish_id",
            "ingredient_id",
            name="uq_dish_ingredients_dish_ingredient",
        ),
    )
    op.create_index(
        "ix_dish_ingredients_dish_id", "dish_ingredients", ["dish_id"]
    )
    op.create_index(
        "ix_dish_ingredients_ingredient_id",
        "dish_ingredients",
        ["ingredient_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dish_ingredients_ingredient_id", table_name="dish_ingredients"
    )
    op.drop_index("ix_dish_ingredients_dish_id", table_name="dish_ingredients")
    op.drop_table("dish_ingredients")
    op.drop_index("ix_dish_cooks_member_id", table_name="dish_cooks")
    op.drop_index("ix_dish_cooks_dish_id", table_name="dish_cooks")
    op.drop_table("dish_cooks")
    op.drop_index("ix_dishes_household_id", table_name="dishes")
    op.drop_table("dishes")
    op.drop_index(
        "ix_ingredient_aliases_ingredient_id", table_name="ingredient_aliases"
    )
    op.drop_index(
        "ix_ingredient_aliases_household_id", table_name="ingredient_aliases"
    )
    op.drop_table("ingredient_aliases")
    op.drop_index("ix_ingredients_household_id", table_name="ingredients")
    op.drop_table("ingredients")
