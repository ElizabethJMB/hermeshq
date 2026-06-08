"""add messaging channel ids to users

Revision ID: a1b2c3d4e5f6
Revises: f5a7d3e29b18
Create Date: 2026-06-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("telegram_id", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("whatsapp_user", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("teams_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("google_chat_email", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("kapso_id", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("kapso_number", sa.String(64), nullable=True))

    op.create_index("ix_users_telegram_id", "users", ["telegram_id"])
    op.create_index("ix_users_whatsapp_user", "users", ["whatsapp_user"])
    op.create_index("ix_users_teams_id", "users", ["teams_id"])
    op.create_index("ix_users_google_chat_email", "users", ["google_chat_email"])
    op.create_index("ix_users_kapso_id", "users", ["kapso_id"])


def downgrade() -> None:
    op.drop_index("ix_users_kapso_id", table_name="users")
    op.drop_index("ix_users_google_chat_email", table_name="users")
    op.drop_index("ix_users_teams_id", table_name="users")
    op.drop_index("ix_users_whatsapp_user", table_name="users")
    op.drop_index("ix_users_telegram_id", table_name="users")

    op.drop_column("users", "kapso_number")
    op.drop_column("users", "kapso_id")
    op.drop_column("users", "google_chat_email")
    op.drop_column("users", "teams_id")
    op.drop_column("users", "whatsapp_user")
    op.drop_column("users", "telegram_id")
