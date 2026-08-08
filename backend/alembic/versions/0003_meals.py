"""Create meal slots, requests, and menu items.

Revision ID: 0003_meals
Revises: 0002_dishes
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_meals"
down_revision: str | None = "0002_dishes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meal_slots",
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("last_modified_by_id", sa.Uuid(), nullable=True),
        sa.Column("last_modified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "meal_type IN ('lunch', 'dinner')",
            name="ck_meal_slots_meal_type",
        ),
        sa.CheckConstraint(
            "status IN ('not_started', 'pending', 'confirmed')",
            name="ck_meal_slots_status",
        ),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["last_modified_by_id"], ["members.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "household_id",
            "local_date",
            "meal_type",
            name="uq_meal_slots_household_date_type",
        ),
    )
    op.create_index("ix_meal_slots_household_id", "meal_slots", ["household_id"])

    op.create_table(
        "meal_requests",
        sa.Column("meal_slot_id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("dish_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dish_id"], ["dishes.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["meal_slot_id"], ["meal_slots.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["member_id"], ["members.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "meal_slot_id",
            "member_id",
            "dish_id",
            name="uq_meal_requests_slot_member_dish",
        ),
    )
    op.create_index(
        "ix_meal_requests_meal_slot_id", "meal_requests", ["meal_slot_id"]
    )
    op.create_index("ix_meal_requests_member_id", "meal_requests", ["member_id"])
    op.create_index("ix_meal_requests_dish_id", "meal_requests", ["dish_id"])

    op.create_table(
        "menu_items",
        sa.Column("meal_slot_id", sa.Uuid(), nullable=False),
        sa.Column("dish_id", sa.Uuid(), nullable=False),
        sa.Column("dish_name_snapshot", sa.String(length=100), nullable=False),
        sa.Column("image_key_snapshot", sa.String(length=255), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dish_id"], ["dishes.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["meal_slot_id"], ["meal_slots.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "meal_slot_id",
            "dish_id",
            name="uq_menu_items_slot_dish",
        ),
    )
    op.create_index("ix_menu_items_meal_slot_id", "menu_items", ["meal_slot_id"])
    op.create_index("ix_menu_items_dish_id", "menu_items", ["dish_id"])


def downgrade() -> None:
    op.drop_index("ix_menu_items_dish_id", table_name="menu_items")
    op.drop_index("ix_menu_items_meal_slot_id", table_name="menu_items")
    op.drop_table("menu_items")
    op.drop_index("ix_meal_requests_dish_id", table_name="meal_requests")
    op.drop_index("ix_meal_requests_member_id", table_name="meal_requests")
    op.drop_index("ix_meal_requests_meal_slot_id", table_name="meal_requests")
    op.drop_table("meal_requests")
    op.drop_index("ix_meal_slots_household_id", table_name="meal_slots")
    op.drop_table("meal_slots")
