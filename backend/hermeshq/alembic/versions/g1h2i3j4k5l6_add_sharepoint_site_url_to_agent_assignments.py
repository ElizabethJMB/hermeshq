"""add sharepoint_site_url to agent_assignments

Revision ID: g1h2i3j4k5l6
Revises: h2i3j4k5l6m7
Create Date: 2026-06-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "g1h2i3j4k5l6"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing = {col["name"] for col in insp.get_columns("agent_assignments")}
    if "sharepoint_site_url" not in existing:
        op.add_column(
            "agent_assignments",
            sa.Column("sharepoint_site_url", sa.String(2048), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing = {col["name"] for col in insp.get_columns("agent_assignments")}
    if "sharepoint_site_url" in existing:
        op.drop_column("agent_assignments", "sharepoint_site_url")
