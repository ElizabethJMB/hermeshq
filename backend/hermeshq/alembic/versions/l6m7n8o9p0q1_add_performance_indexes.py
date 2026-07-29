"""add performance indexes for common order/filter columns

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-07-17

Every task listing orders by tasks.queued_at, the queue/dashboard queries
filter by (agent_id, status), and all log/message/audit listings order by
created_at — none of these had an index.
"""

from __future__ import annotations

from alembic import op

revision = "l6m7n8o9p0q1"
down_revision = "k5l6m7n8o9p0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_tasks_queued_at", "tasks", ["queued_at"], if_not_exists=True)
    op.create_index("ix_tasks_agent_status", "tasks", ["agent_id", "status"], if_not_exists=True)
    op.create_index("ix_activity_logs_created_at", "activity_logs", ["created_at"], if_not_exists=True)
    op.create_index("ix_agent_messages_created_at", "agent_messages", ["created_at"], if_not_exists=True)
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs", if_exists=True)
    op.drop_index("ix_agent_messages_created_at", table_name="agent_messages", if_exists=True)
    op.drop_index("ix_activity_logs_created_at", table_name="activity_logs", if_exists=True)
    op.drop_index("ix_tasks_agent_status", table_name="tasks", if_exists=True)
    op.drop_index("ix_tasks_queued_at", table_name="tasks", if_exists=True)
