"""add agent_memories table

Revision ID: df8701c01bc9
Revises: l6m7n8o9p0q1
Create Date: 2026-08-03 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "df8701c01bc9"
down_revision: str | None = "l6m7n8o9p0q1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    return table_name in insp.get_table_names()


def upgrade() -> None:
    if not _table_exists("agent_memories"):
        op.create_table(
            "agent_memories",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("agent_id", sa.String(36), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("memory_key", sa.String(128), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("category", sa.String(32), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("agent_id", "memory_key", name="uq_agent_memories_agent_key"),
        )
        op.create_index("ix_agent_memories_agent_id", "agent_memories", ["agent_id"])


def downgrade() -> None:
    if _table_exists("agent_memories"):
        op.drop_index("ix_agent_memories_agent_id", table_name="agent_memories", if_exists=True)
        op.drop_table("agent_memories")
