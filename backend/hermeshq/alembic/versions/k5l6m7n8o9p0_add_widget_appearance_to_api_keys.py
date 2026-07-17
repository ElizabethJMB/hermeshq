"""add widget appearance columns to public_chat_api_keys

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-07-14
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "k5l6m7n8o9p0"
down_revision = "j4k5l6m7n8o9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("public_chat_api_keys", sa.Column("widget_title", sa.String(255), nullable=True))
    op.add_column(
        "public_chat_api_keys", sa.Column("widget_theme", sa.String(10), server_default="auto", nullable=False)
    )
    op.add_column(
        "public_chat_api_keys", sa.Column("widget_accent", sa.String(10), server_default="#6366f1", nullable=False)
    )
    op.add_column(
        "public_chat_api_keys", sa.Column("widget_position", sa.String(10), server_default="right", nullable=False)
    )


def downgrade() -> None:
    op.drop_column("public_chat_api_keys", "widget_position")
    op.drop_column("public_chat_api_keys", "widget_accent")
    op.drop_column("public_chat_api_keys", "widget_theme")
    op.drop_column("public_chat_api_keys", "widget_title")
