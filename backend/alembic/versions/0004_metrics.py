"""Create activity events and validation check-ins.

Revision ID: 0004_metrics
Revises: 0003_meals
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_metrics"
down_revision: str | None = "0003_meals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activity_events",
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("properties", sa.JSON(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["member_id"], ["members.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_activity_events_household_id", "activity_events", ["household_id"]
    )
    op.create_index(
        "ix_activity_events_member_id", "activity_events", ["member_id"]
    )
    op.create_index("ix_activity_events_name", "activity_events", ["name"])

    op.create_table(
        "validation_checkins",
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("home_meal_count", sa.Integer(), nullable=False),
        sa.Column("offline_discussion_count", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "household_id",
            "week_start",
            name="uq_validation_checkins_household_week",
        ),
    )
    op.create_index(
        "ix_validation_checkins_household_id",
        "validation_checkins",
        ["household_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_validation_checkins_household_id", table_name="validation_checkins"
    )
    op.drop_table("validation_checkins")
    op.drop_index("ix_activity_events_name", table_name="activity_events")
    op.drop_index("ix_activity_events_member_id", table_name="activity_events")
    op.drop_index("ix_activity_events_household_id", table_name="activity_events")
    op.drop_table("activity_events")
