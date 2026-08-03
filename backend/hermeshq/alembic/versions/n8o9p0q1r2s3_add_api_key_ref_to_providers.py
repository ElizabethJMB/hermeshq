"""add api_key_ref to providers

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-07-26
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "n8o9p0q1r2s3"
down_revision: str | Sequence[str] | None = "m7n8o9p0q1r2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    return column_name in {col["name"] for col in insp.get_columns(table_name)}


def upgrade() -> None:
    if _column_exists("providers", "api_key_ref"):
        return

    op.add_column(
        "providers",
        sa.Column("api_key_ref", sa.String(128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("providers", "api_key_ref")
