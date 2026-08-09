"""Store household invite codes in plaintext for re-display.

Revision ID: 0005_persistent_invite_code
Revises: 0004_metrics

Existing hashes cannot be reversed; each household receives a new invite code.
"""

from __future__ import annotations

import secrets
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_persistent_invite_code"
down_revision: str | None = "0004_metrics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def _generate_invite_code(used: set[str]) -> str:
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(8))
        if code not in used:
            used.add(code)
            return code


def upgrade() -> None:
    op.add_column(
        "households",
        sa.Column("invite_code", sa.String(length=8), nullable=True),
    )

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id FROM households")).fetchall()
    used: set[str] = set()
    for (household_id,) in rows:
        code = _generate_invite_code(used)
        connection.execute(
            sa.text("UPDATE households SET invite_code = :code WHERE id = :id"),
            {"code": code, "id": household_id},
        )

    with op.batch_alter_table("households") as batch_op:
        batch_op.alter_column(
            "invite_code", existing_type=sa.String(length=8), nullable=False
        )
        batch_op.create_unique_constraint("uq_households_invite_code", ["invite_code"])
        batch_op.drop_column("invite_code_hash")


def downgrade() -> None:
    from app.security import hash_secret

    op.add_column(
        "households",
        sa.Column("invite_code_hash", sa.String(length=64), nullable=True),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, invite_code FROM households")
    ).fetchall()
    for household_id, invite_code in rows:
        connection.execute(
            sa.text(
                "UPDATE households SET invite_code_hash = :invite_hash WHERE id = :id"
            ),
            {"invite_hash": hash_secret(invite_code), "id": household_id},
        )

    with op.batch_alter_table("households") as batch_op:
        batch_op.alter_column(
            "invite_code_hash", existing_type=sa.String(length=64), nullable=False
        )
        batch_op.create_unique_constraint(
            "uq_households_invite_code_hash", ["invite_code_hash"]
        )
        batch_op.drop_constraint("uq_households_invite_code", type_="unique")
        batch_op.drop_column("invite_code")
