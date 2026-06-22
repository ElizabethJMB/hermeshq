"""add sharepoint_site_url to agent_assignments

Revision ID: b3c4d5e6f7a8
Revises: e2f3a4b5c6d7
Create Date: 2026-06-22 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "b3c4d5e6f7a8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [col["name"] for col in insp.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    if not _column_exists("agent_assignments", "sharepoint_site_url"):
        op.add_column(
            "agent_assignments",
            sa.Column("sharepoint_site_url", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    if _column_exists("agent_assignments", "sharepoint_site_url"):
        op.drop_column("agent_assignments", "sharepoint_site_url")
