"""add teams bot config to app_settings

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("app_settings", sa.Column("teams_bot_url", sa.String(512), nullable=True))
    op.add_column("app_settings", sa.Column("teams_bot_admin_key_ref", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("app_settings", "teams_bot_admin_key_ref")
    op.drop_column("app_settings", "teams_bot_url")
